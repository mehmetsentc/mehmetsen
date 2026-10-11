/**
 * Actor-scoped social operations used by /api/social/* (every NaHaber user:
 * central admin, il yöneticisi, publisher member, normal user).
 *
 * Every function re-checks ownership server-side; nothing from the client
 * (owner, platform, scope) is trusted. Manual shares always carry an explicit
 * target — never the legacy Onyeditivi credentials.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { canAccessContentScope, contentScopeOf } from '@/lib/cms/rbacScope'
import { loadSocialAccount } from './accounts/accountStore'
import { canManageAccount, canPublishToAccount, canViewAccount, ruleScopeProblem, type SocialActor } from './accounts/access'
import { listAccountsForActor } from './accounts/connect/flows'
import { supportedFormats, targetBlocker, TARGET_BLOCKER_TEXT, type PublishFormat } from './accounts/capabilities'
import { ownershipKind, toPublicSocialAccount, type SocialAccount } from './accounts/types'
import { writeSocialAudit } from './accounts/audit'
import { CLAIM_TEXT } from './accounts/publishLedger'
import { socialEligibility } from './eligibility'
import { evaluateRuleConditions, newsFactsFrom, summarizeRule } from './automation/match'
import { createRule, deleteRule, getRule, listRules, setRuleEnabled, updateRule } from './automation/ruleStore'
import { listRecentJobs } from './automation/jobs'
import { manualTargetCheck } from './accounts/manualTargets'
import { parsePublishScope, readPublishScope } from './accounts/publishScope'
import type { AutomationRuleInput } from './automation/types'
import type { SocialPublishResult } from './types'

type Err = { ok: false; status: number; code: string; message: string }
const err = (status: number, code: string, message: string): Err => ({ ok: false, status, code, message })

async function accountForActor(actor: SocialActor, accountId: string, need: 'view' | 'publish' | 'manage'): Promise<SocialAccount | Err> {
  const loaded = await loadSocialAccount(accountId)
  if (loaded.state !== 'ok') return err(404, 'not_found', 'Hesap bulunamadı')
  const a = loaded.account
  const allowed = need === 'manage' ? canManageAccount(actor, a.ownership) : need === 'publish' ? canPublishToAccount(actor, a.ownership) : canViewAccount(actor, a.ownership)
  // Same answer for "missing" and "not yours": an account id reveals nothing.
  if (!allowed) return err(404, 'not_found', 'Hesap bulunamadı')
  return a
}

// ── Accounts ────────────────────────────────────────────────────────────────

export async function accountsForActor(actor: SocialActor) {
  const accounts = await listAccountsForActor(actor)
  const now = Date.now()
  return accounts.map((a) => {
    const pub = toPublicSocialAccount(a)
    return {
      ...pub,
      canManage: canManageAccount(actor, a.ownership),
      canPublish: canPublishToAccount(actor, a.ownership),
      formats: supportedFormats(a),
      publishScope: readPublishScope(a, supportedFormats(a)),
      // Connection ≠ publish permission ≠ automation: separate states.
      health: {
        connected: a.connectionMethod !== 'legacy',
        publishBlocker: (['post', 'story'] as PublishFormat[])
          .filter((f) => supportedFormats(a).includes(f))
          .map((f) => targetBlocker(pub, f, now))
          .find((b) => b) ?? null,
        tokenExpiresAt: a.tokenExpiresAt,
        tokenWarning: a.tokenExpiresAt !== null && a.tokenExpiresAt - now < 7 * 86_400_000,
      },
    }
  })
}

/**
 * «Yayın kapsamı ve izinler» — NaHaber-side manual publish scope. Account
 * managers only; an il yöneticisi can only choose their own il / ilçe.
 * Platform API permissions are untouched (they come from the platform).
 */
export async function setPublishScopeForActor(actor: SocialActor, accountId: string, raw: unknown) {
  const a = await accountForActor(actor, accountId, 'manage')
  if ('ok' in a) return a
  if (a.connectionMethod === 'legacy') return err(409, 'legacy', 'Eski bağlantının kapsamı düzenlenemez')
  const parsed = parsePublishScope(raw, supportedFormats(a))
  if (!parsed.ok) return err(400, 'invalid_scope', parsed.message)
  const problem = ruleScopeProblem(actor, a.ownership, { geo: parsed.value.geo, dailyLimit: 0 })
  if (problem) return err(403, 'scope_forbidden', problem)
  const before = readPublishScope(a, supportedFormats(a))
  const now = Date.now()
  const value = { ...parsed.value, updatedAt: now, updatedBy: actor.uid }
  await getAdminFirestore().collection(Collections.SOCIAL_ACCOUNTS).doc(a.id).update({ publishScope: value, updatedAt: now, updatedBy: actor.uid })
  await writeSocialAudit({
    actorId: actor.uid,
    action: 'social.account.scope',
    entityType: 'socialAccount',
    entityId: a.id,
    before: { geo: before.geo, allCategories: before.allCategories, categoryIds: before.categoryIds, formats: before.formats, manualAccess: before.manualAccess },
    after: { geo: value.geo, allCategories: value.allCategories, categoryIds: value.categoryIds, formats: value.formats, manualAccess: value.manualAccess },
  })
  return { ok: true as const, publishScope: value }
}

/**
 * «Bağlantıyı kaldır»: removes the platform access for this account.
 *   - the encrypted access token is deleted;
 *   - platform profile data (name, username, granted permissions, expiry) is
 *     cleared and the account becomes `disabled`;
 *   - its automation rules are switched off and queued jobs cancelled.
 * The account id, ownership and the publish ledger / audit history are kept
 * (they prevent duplicate posts and record what was published). Connecting
 * the same account again later goes through the platform login.
 */
export async function disconnectAccountForActor(actor: SocialActor, accountId: string) {
  const a = await accountForActor(actor, accountId, 'manage')
  if ('ok' in a) return a
  if (a.connectionMethod === 'legacy') return err(409, 'legacy', 'Eski bağlantı bu panelden kaldırılamaz')
  const db = getAdminFirestore()
  const now = Date.now()
  const accRef = db.collection(Collections.SOCIAL_ACCOUNTS).doc(a.id)
  const secRef = db.collection(Collections.SOCIAL_ACCOUNT_SECRETS).doc(a.id)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(accRef)
    if (!snap.exists) return
    tx.delete(secRef)
    tx.update(accRef, {
      status: 'disabled',
      statusReason: 'Bağlantı kaldırıldı — yeniden kullanmak için platform girişiyle bağlayın',
      displayName: 'Bağlantısı kaldırılmış hesap',
      username: null,
      grantedPermissions: null,
      permissionsVerifiedAt: null,
      tokenExpiresAt: null,
      tokenExpiryVerified: false,
      tokenWarning: null,
      disconnectedAt: now,
      updatedAt: now,
      updatedBy: actor.uid,
    })
  })
  const rules = (await listRules()).filter((r) => r.accountId === a.id && r.enabled)
  for (const r of rules) await setRuleEnabled(r.id, false, actor.uid, now).catch(() => undefined)
  const { cancelQueuedForAccount } = await import('./automation/jobs')
  const cancelled = await cancelQueuedForAccount(a.id, 'account_disconnected', now).catch(() => 0)
  await writeSocialAudit({
    actorId: actor.uid,
    action: 'social.account.disconnect',
    entityType: 'socialAccount',
    entityId: a.id,
    meta: { rulesDisabled: rules.length, jobsCancelled: cancelled },
  })
  return { ok: true as const, rulesDisabled: rules.length, jobsCancelled: cancelled }
}

// ── Rules ───────────────────────────────────────────────────────────────────

export async function rulesForActor(actor: SocialActor) {
  const [rules, accounts] = await Promise.all([listRules(), listAccountsForActor(actor)])
  const byId = new Map(accounts.map((a) => [a.id, a]))
  return rules
    .filter((r) => byId.has(r.accountId))
    .map((r) => ({ ...r, summary: summarizeRule(r), canManage: canManageAccount(actor, byId.get(r.accountId)!.ownership) }))
}

export async function createRuleForActor(actor: SocialActor, input: AutomationRuleInput) {
  const a = await accountForActor(actor, input.accountId, 'manage')
  if ('ok' in a) return a
  const scope = ruleScopeProblem(actor, a.ownership, input)
  if (scope) return err(403, 'rule_scope', scope)
  const r = await createRule(input, actor.uid, Date.now())
  if (!r.ok) return err(r.status, r.code, r.message)
  return { ok: true as const, rule: { ...r.rule, summary: summarizeRule(r.rule) } }
}

async function ruleForActor(actor: SocialActor, ruleId: string) {
  const rule = await getRule(ruleId)
  if (!rule) return err(404, 'not_found', 'Kural bulunamadı')
  const a = await accountForActor(actor, rule.accountId, 'manage')
  if ('ok' in a) return err(404, 'not_found', 'Kural bulunamadı')
  return { rule, account: a }
}

export async function updateRuleForActor(actor: SocialActor, ruleId: string, input: AutomationRuleInput) {
  const r = await ruleForActor(actor, ruleId)
  if ('ok' in r) return r
  const scope = ruleScopeProblem(actor, r.account.ownership, input)
  if (scope) return err(403, 'rule_scope', scope)
  const u = await updateRule(ruleId, input, actor.uid, Date.now())
  if (!u.ok) return err(u.status, u.code, u.message)
  return { ok: true as const, rule: { ...u.rule, summary: summarizeRule(u.rule) } }
}

export async function setRuleEnabledForActor(actor: SocialActor, ruleId: string, enabled: boolean) {
  const r = await ruleForActor(actor, ruleId)
  if ('ok' in r) return r
  // Scope may have shrunk since the rule was written (role / scope change).
  if (enabled) {
    const scope = ruleScopeProblem(actor, r.account.ownership, r.rule)
    if (scope) return err(403, 'rule_scope', scope)
  }
  const s = await setRuleEnabled(ruleId, enabled, actor.uid, Date.now())
  if (!s.ok) return err(s.status, s.code, s.message)
  return { ok: true as const, rule: { ...s.rule, summary: summarizeRule(s.rule) }, cancelledJobs: s.cancelledJobs }
}

export async function deleteRuleForActor(actor: SocialActor, ruleId: string) {
  const r = await ruleForActor(actor, ruleId)
  if ('ok' in r) return r
  const d = await deleteRule(ruleId, actor.uid)
  if (!d.ok) return err(d.status, d.code, d.message)
  return { ok: true as const }
}

type EligHelpers = Parameters<typeof socialEligibility>[1]

/** Dry run over recent published news (≤ 80 reads). Never publishes. */
export async function previewRuleForActor(actor: SocialActor, input: AutomationRuleInput, helpers: EligHelpers) {
  const a = await accountForActor(actor, input.accountId, 'manage')
  if ('ok' in a) return a
  const scope = ruleScopeProblem(actor, a.ownership, input)
  if (scope) return err(403, 'rule_scope', scope)
  const publisherId = ownershipKind(a.ownership) === 'publisher' ? a.ownership.publisherId : null
  const col = getAdminFirestore().collection(Collections.NEWS)
  const snap = publisherId
    ? await col.where('publisherId', '==', publisherId).limit(80).get()
    : await col.where('status', '==', 'published').orderBy('publishedAt', 'desc').limit(80).get()
  const items = snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>
      const facts = newsFactsFrom(d.id, data)
      const ev = evaluateRuleConditions(input, facts)
      const elig = socialEligibility(data, helpers)
      return {
        newsId: d.id,
        title: typeof data.title === 'string' ? data.title.slice(0, 160) : '',
        publishedAt: facts.publishedAt,
        citySlug: facts.citySlug || null,
        categoryId: facts.categoryId || null,
        status: facts.status,
        match: facts.status === 'published' && ev.match && elig.ok,
        conditionsMatch: ev.match,
        reasons: elig.ok ? ev.reasons : [...ev.reasons, elig.text],
        action: elig.ok ? null : elig.action,
        eligibilityCode: elig.ok ? null : elig.code,
      }
    })
    .filter((i) => i.status === 'published')
    .sort((x, y) => (y.publishedAt ?? 0) - (x.publishedAt ?? 0))
  return {
    ok: true as const,
    summary: summarizeRule(input),
    scanned: items.length,
    matched: items.filter((i) => i.match).length,
    items,
  }
}

// ── Manual share ────────────────────────────────────────────────────────────

export interface ShareInput {
  newsId: string
  accountId: string
  format: PublishFormat
}

export type ShareOutcome =
  | { ok: true; result: { status: 'published' | 'already_published'; platformId: string | null; account: string; platform: string; format: PublishFormat } }
  | { ok: false; status: number; code: string; message: string; action?: string; ledgerStatus?: string }

const NEWS_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export async function shareForActor(
  actor: SocialActor,
  input: ShareInput,
  deps: { publish: typeof import('./publishOneSocial').publishOneSocial; helpers: EligHelpers; now?: () => number },
): Promise<ShareOutcome> {
  const now = deps.now ?? Date.now
  if (!NEWS_ID_RE.test(input.newsId)) return err(400, 'invalid_news', 'Geçersiz haber')
  if (input.format !== 'post' && input.format !== 'story') return err(400, 'invalid_format', 'Geçersiz biçim')
  const loaded = await loadSocialAccount(input.accountId)
  // Same answer for "missing" and "not yours": an account id reveals nothing.
  if (loaded.state !== 'ok' || loaded.account.connectionMethod === 'legacy') return err(404, 'not_found', 'Hesap bulunamadı')
  const a = loaded.account
  const pub = toPublicSocialAccount(a)

  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(input.newsId).get()
  if (!snap.exists) return err(404, 'news_not_found', 'Haber bulunamadı')
  const data = snap.data() as Record<string, unknown>
  // Yetki, bağlantı/izin, biçim ve hesabın yayın kapsamı (haberin kendi konumu) — sunucuda.
  const check = manualTargetCheck(actor, a, { id: input.newsId, data }, [input.format], now())
  if (!check.ok) return check.hidden ? err(404, 'not_found', 'Hesap bulunamadı') : err(409, check.code, check.reason)
  const facts = newsFactsFrom(input.newsId, data)
  if (facts.status !== 'published' || (facts.publishedAt !== null && facts.publishedAt > now()) || data.visibility === 'private') {
    return err(409, 'news_not_public', 'Haber yayında / herkese açık değil')
  }
  const elig = socialEligibility(data, deps.helpers)
  if (!elig.ok) {
    // Newsroom staff with rights on this content keep their existing manual judgement.
    const staffOverride = actor.isStaff && (actor.central || canStaffAccess(actor, data)) && (elig.code === 'needs_social_review')
    if (!staffOverride) return { ok: false, status: 409, code: elig.code, message: elig.text, action: `${elig.action} — ya da «Bağlantıyı paylaş» ile yalnızca haber linkini paylaşın` }
  }

  const platform = a.platform
  const r = await deps.publish(input.newsId, {
    mode: input.format,
    manual: true,
    actorUid: actor.uid,
    noAi: true,
    trigger: 'share',
    targets: { [platform]: a.id },
    overrides: {
      platforms: { facebook: platform === 'facebook', instagram: platform === 'instagram', threads: platform === 'threads', twitter: false },
      ...(input.format === 'post' ? { imageMode: 'single' as const } : {}),
    },
  })
  const set = input.format === 'post' ? r.post : r.story
  const res = (set as unknown as Record<string, SocialPublishResult | undefined> | undefined)?.[platform]
  const label = pub.username ? `@${pub.username}` : pub.displayName
  await writeSocialAudit({
    actorId: actor.uid,
    action: 'social.publish.share',
    entityType: 'socialAccount',
    entityId: a.id,
    meta: { newsId: input.newsId, format: input.format, result: res?.ledgerStatus ?? (r.skipped ? 'skipped' : 'unknown'), code: res?.code ?? null },
  })
  if (r.skipped) return err(409, 'skipped', r.reason ?? 'Paylaşım yapılmadı')
  if (!res) return { ok: false, status: 202, code: 'no_result', message: 'Platform sonucu alınamadı — platformda kontrol edin; otomatik tekrar yapılmadı', ledgerStatus: 'uncertain' }
  if (res.success && res.platformId) {
    return { ok: true, result: { status: 'published', platformId: res.platformId, account: label, platform, format: input.format } }
  }
  if (res.code === 'already_published') {
    return { ok: true, result: { status: 'already_published', platformId: res.platformId ?? null, account: label, platform, format: input.format } }
  }
  const message = res.code && CLAIM_TEXT[res.code] ? CLAIM_TEXT[res.code] : res.error ?? 'Paylaşım başarısız'
  return { ok: false, status: res.ledgerStatus === 'uncertain' ? 202 : 409, code: res.code ?? 'failed', message, ledgerStatus: res.ledgerStatus }
}

function canStaffAccess(actor: SocialActor, data: Record<string, unknown>): boolean {
  // Province managers: content of their own province(s).
  if (actor.provinces.length === 0) return false
  const scope = contentScopeOf(data)
  return canAccessContentScope({ kind: 'scoped', scope: { provinceSlugs: actor.provinces, districtSlugs: [], categoryIds: [] } }, scope)
}

// ── History ─────────────────────────────────────────────────────────────────

export async function historyForActor(actor: SocialActor, accountId: string | null) {
  const accounts = (await listAccountsForActor(actor)).filter((a) => canPublishToAccount(actor, a.ownership))
  const ids = accountId ? accounts.filter((a) => a.id === accountId).map((a) => a.id) : accounts.map((a) => a.id)
  if (ids.length === 0) return { records: [], jobs: [] }
  const col = getAdminFirestore().collection(Collections.SOCIAL_PUBLISH_RECORDS)
  const snaps = await Promise.all(ids.slice(0, 20).map((id) => col.where('accountId', '==', id).limit(30).get()))
  const records = snaps
    .flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as Record<string, unknown>))
    .map((d) => ({
      newsId: String(d.newsId ?? ''),
      accountId: String(d.accountId ?? ''),
      platform: String(d.platform ?? ''),
      format: String(d.format ?? ''),
      status: String(d.status ?? ''),
      externalPostId: typeof d.externalPostId === 'string' ? d.externalPostId : null,
      trigger: typeof d.lastTrigger === 'string' ? d.lastTrigger : null,
      updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
    }))
    .sort((x, y) => y.updatedAt - x.updatedAt)
    .slice(0, 100)
  const jobs = await listRecentJobs({ since: Date.now() - 7 * 86_400_000, limit: 200, accountIds: new Set(ids) })
  return { records, jobs }
}
