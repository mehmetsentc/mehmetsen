/**
 * Automation rules + legacy handoff records (Firestore, Admin SDK only).
 *
 * - Rules are created DISABLED. Enabling sets `enabledAt = now`: only news
 *   published from that moment can match (no backfill).
 * - Target account, platform and ownership come from the account record,
 *   never from the client. The target account of a rule cannot be changed.
 * - Disabling cancels the account's queued jobs that no other enabled rule
 *   still covers; published posts are never touched.
 *
 * Legacy handoff (`socialAutomationState/legacyHandoff`): an explicit per-account
 * record saying "the old Onyeditivi automatic path must not publish to this
 * account any more". Only automatic legacy triggers (cron / after) read it;
 * manual legacy sharing and the ledger keep working as before.
 */
import { randomBytes } from 'node:crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { loadSocialAccount } from '../accounts/accountStore'
import { supportedFormats, targetBlocker, TARGET_BLOCKER_TEXT } from '../accounts/capabilities'
import { toPublicSocialAccount, type SocialAccount, type SocialAccountPlatform } from '../accounts/types'
import { writeSocialAudit } from '../accounts/audit'
import { cancelQueuedForAccount } from './jobs'
import type { AutomationRule, AutomationRuleInput } from './types'

const RULE_ID_RE = /^r_[a-f0-9]{16}$/
export const MAX_RULES = 500

function rulesCol() {
  return getAdminFirestore().collection(Collections.SOCIAL_AUTOMATION_RULES)
}
function stateCol() {
  return getAdminFirestore().collection(Collections.SOCIAL_AUTOMATION_STATE)
}

export function isRuleId(id: unknown): id is string {
  return typeof id === 'string' && RULE_ID_RE.test(id)
}

export async function listRules(opts: { enabledOnly?: boolean } = {}): Promise<AutomationRule[]> {
  const q = opts.enabledOnly ? rulesCol().where('enabled', '==', true).limit(MAX_RULES) : rulesCol().limit(MAX_RULES)
  const snap = await q.get()
  return snap.docs.map((d) => ({ ...(d.data() as AutomationRule), id: d.id }))
}

export async function getRule(id: string): Promise<AutomationRule | null> {
  if (!isRuleId(id)) return null
  const s = await rulesCol().doc(id).get()
  return s.exists ? ({ ...(s.data() as AutomationRule), id }) : null
}

export type RuleStoreError = { ok: false; code: string; message: string; status: number }
type Ok<T> = { ok: true } & T

async function accountFor(accountId: string): Promise<SocialAccount | RuleStoreError> {
  const loaded = await loadSocialAccount(accountId)
  if (loaded.state !== 'ok') return { ok: false, code: 'account_not_found', message: 'Hedef hesap bulunamadı', status: 404 }
  return loaded.account
}

function formatProblem(account: SocialAccount, formats: AutomationRuleInput['formats']): RuleStoreError | null {
  const supported = supportedFormats(account)
  const missing = formats.filter((f) => !supported.includes(f))
  if (missing.length === 0) return null
  return {
    ok: false,
    code: 'format_unsupported',
    message: `Bu hesap şu biçimi desteklemiyor: ${missing.map((f) => (f === 'post' ? 'gönderi' : 'hikâye')).join(', ')}`,
    status: 400,
  }
}

export async function createRule(input: AutomationRuleInput, actorUid: string, now: number): Promise<Ok<{ rule: AutomationRule }> | RuleStoreError> {
  const account = await accountFor(input.accountId)
  if ('ok' in account) return account
  const fp = formatProblem(account, input.formats)
  if (fp) return fp
  const id = `r_${randomBytes(8).toString('hex')}`
  const rule: AutomationRule = {
    ...input,
    id,
    platform: account.platform,
    ownership: { citySlug: account.ownership.citySlug ?? null, publisherId: account.ownership.publisherId ?? null },
    enabled: false,
    enabledAt: null,
    createdAt: now,
    createdBy: actorUid,
    updatedAt: now,
    updatedBy: actorUid,
  }
  await rulesCol().doc(id).create({ ...rule })
  await writeSocialAudit({ actorId: actorUid, action: 'social.automation.rule_create', entityType: 'socialAutomationRule', entityId: id, after: ruleAuditView(rule) })
  return { ok: true, rule }
}

export async function updateRule(id: string, input: AutomationRuleInput, actorUid: string, now: number): Promise<Ok<{ rule: AutomationRule }> | RuleStoreError> {
  const before = await getRule(id)
  if (!before) return { ok: false, code: 'not_found', message: 'Kural bulunamadı', status: 404 }
  if (input.accountId !== before.accountId) {
    return { ok: false, code: 'account_immutable', message: 'Kuralın hedef hesabı değiştirilemez — yeni kural oluşturun', status: 400 }
  }
  const account = await accountFor(input.accountId)
  if ('ok' in account) return account
  const fp = formatProblem(account, input.formats)
  if (fp) return fp
  const rule: AutomationRule = {
    ...before,
    ...input,
    // Changed conditions apply only to news published from now on (no backfill).
    enabledAt: before.enabled ? now : null,
    updatedAt: now,
    updatedBy: actorUid,
  }
  await rulesCol().doc(id).set({ ...rule })
  await writeSocialAudit({ actorId: actorUid, action: 'social.automation.rule_update', entityType: 'socialAutomationRule', entityId: id, before: ruleAuditView(before), after: ruleAuditView(rule) })
  return { ok: true, rule }
}

export async function setRuleEnabled(
  id: string,
  enabled: boolean,
  actorUid: string,
  now: number,
): Promise<Ok<{ rule: AutomationRule; cancelledJobs: number }> | RuleStoreError> {
  const before = await getRule(id)
  if (!before) return { ok: false, code: 'not_found', message: 'Kural bulunamadı', status: 404 }
  if (enabled) {
    const account = await accountFor(before.accountId)
    if ('ok' in account) return account
    const pub = toPublicSocialAccount(account)
    for (const f of before.formats) {
      const b = targetBlocker(pub, f, now)
      if (b) return { ok: false, code: b, message: `Hesap otomatik yayına hazır değil: ${TARGET_BLOCKER_TEXT[b]}`, status: 409 }
    }
  }
  const rule: AutomationRule = {
    ...before,
    enabled,
    enabledAt: enabled ? (before.enabled ? before.enabledAt : now) : null,
    updatedAt: now,
    updatedBy: actorUid,
  }
  await rulesCol().doc(id).set({ ...rule })
  let cancelledJobs = 0
  if (!enabled && before.enabled) {
    // Spare jobs another enabled rule of the same account still covers (pre-send recheck re-evaluates them).
    const others = (await listRules({ enabledOnly: true })).filter((r) => r.id !== id && r.accountId === before.accountId)
    cancelledJobs = await cancelQueuedForAccount(before.accountId, 'rule_disabled', now, (j) => others.some((r) => r.formats.includes(j.format)))
  }
  await writeSocialAudit({
    actorId: actorUid,
    action: enabled ? 'social.automation.rule_enable' : 'social.automation.rule_disable',
    entityType: 'socialAutomationRule',
    entityId: id,
    meta: { accountId: before.accountId, cancelledJobs },
  })
  return { ok: true, rule, cancelledJobs }
}

export async function deleteRule(id: string, actorUid: string): Promise<Ok<object> | RuleStoreError> {
  const before = await getRule(id)
  if (!before) return { ok: false, code: 'not_found', message: 'Kural bulunamadı', status: 404 }
  if (before.enabled) return { ok: false, code: 'rule_enabled', message: 'Önce kuralı kapatın', status: 409 }
  await rulesCol().doc(id).delete()
  await writeSocialAudit({ actorId: actorUid, action: 'social.automation.rule_delete', entityType: 'socialAutomationRule', entityId: id, before: ruleAuditView(before) })
  return { ok: true }
}

function ruleAuditView(r: AutomationRule): Record<string, unknown> {
  return {
    name: r.name,
    accountId: r.accountId,
    geo: r.geo,
    categoryIds: r.categoryIds,
    allCategories: r.allCategories,
    featuredMode: r.featuredMode,
    featuredKind: r.featuredKind,
    formats: r.formats,
    dailyLimit: r.dailyLimit,
    minIntervalMinutes: r.minIntervalMinutes,
    quietHours: r.quietHours,
    enabled: r.enabled,
  }
}

export { readLegacyHandoffs, isLegacyHandedOff, setLegacyHandoff, type LegacyHandoff } from './handoff'
