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
  const a = await accountForActor(actor, input.accountId, 'publish')
  if ('ok' in a) return a
  const pub = toPublicSocialAccount(a)
  const blocker = targetBlocker(pub, input.format, now())
  if (blocker) return err(409, blocker, `Hesap: ${TARGET_BLOCKER_TEXT[blocker]}`)

  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(input.newsId).get()
  if (!snap.exists) return err(404, 'news_not_found', 'Haber bulunamadı')
  const data = snap.data() as Record<string, unknown>
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
  if (!res) return err(502, 'no_result', 'Platform sonucu alınamadı — platformda kontrol edin; otomatik tekrar yapılmadı')
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
