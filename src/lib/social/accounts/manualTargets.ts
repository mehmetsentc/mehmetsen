/**
 * Manual share targets for ONE news item (server). Used by the Post / Hikâye
 * picker (listing) and re-checked by every manual publish route.
 *
 * An account is selectable only when ALL hold:
 *   1. the actor may use it manually (owner / manager / publisher editor, or
 *      «Manuel paylaşım: kapsamdaki editörler» + the editor's staff scope);
 *   2. the news item is inside the editor's own content scope (scoped staff);
 *   3. the connection can publish this format (status, token, permissions);
 *   4. the format is allowed in the account's NaHaber publish scope;
 *   5. the news location / category is inside the account's MANUAL scope for
 *      that format — posts use the post scope, stories the story scope (il /
 *      merkez accounts: all locations by default). Each news item is checked by
 *      its own stored location; missing location never counts as national or
 *      as an il. Automation rules are never consulted.
 *
 * Reason codes are distinct so the picker can say which one applies:
 *   reconnect_required · format_unsupported · format_not_allowed ·
 *   outside_location · outside_category · account_unavailable · …
 * There is no legacy / Onyeditivi fallback: no account → no manual share.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { canAccessContentScope, contentScopeOf } from '@/lib/cms/rbacScope'
import { canManageAccount, canPublishToAccount, canUseForManual, type SocialActor } from './access'
import { listAccountsForActor } from './connect/flows'
import { supportedFormats, targetBlocker, TARGET_BLOCKER_TEXT, type PublishFormat, type TargetBlocker } from './capabilities'
import { readPublishScope, newsScopeProblemFor, type AccountPublishScope } from './publishScope'
import { ownershipKind, parseSocialAccount, toPublicSocialAccount, type SocialAccount } from './types'
import { newsFactsFrom } from '../automation/match'

export type ManualTargetCheck =
  | { ok: true; scope: AccountPublishScope }
  | { ok: false; code: string; reason: string; reconnect: boolean; hidden: boolean }

const RECONNECT_BLOCKERS = new Set<TargetBlocker>(['status_needs_reauth', 'token_expired', 'publish_permission_missing', 'publish_permission_unverified'])

export function manualTargetCheck(
  actor: SocialActor,
  account: SocialAccount,
  news: { id: string; data: Record<string, unknown> },
  formats: PublishFormat[],
  now: number,
): ManualTargetCheck {
  const scope = readPublishScope(account, supportedFormats(account))
  if (!canUseForManual(actor, account.ownership, scope.manualAccess)) {
    return { ok: false, code: 'not_permitted', reason: 'Bu hesapla paylaşım yetkiniz yok', reconnect: false, hidden: true }
  }
  const viaEditorScope = !canPublishToAccount(actor, account.ownership)
  if (viaEditorScope && actor.staffScope) {
    const inScope = canAccessContentScope(
      { kind: 'scoped', scope: { provinceSlugs: actor.staffScope.provinces, districtSlugs: actor.staffScope.districts, categoryIds: actor.staffScope.categories } },
      contentScopeOf(news.data),
    )
    if (!inScope) return { ok: false, code: 'outside_staff_scope', reason: 'Haber sizin editör kapsamınızın dışında', reconnect: false, hidden: false }
  }
  const pub = toPublicSocialAccount(account)
  for (const f of formats) {
    const b = targetBlocker(pub, f, now)
    if (b) {
      const reconnect = RECONNECT_BLOCKERS.has(b)
      return {
        ok: false,
        code: reconnect ? 'reconnect_required' : b === 'format_unsupported' ? 'format_unsupported' : 'account_unavailable',
        reason: reconnect
          ? `Yeniden bağlantı gerekli (${TARGET_BLOCKER_TEXT[b]})`
          : b === 'format_unsupported'
            ? `Biçim desteklenmiyor: hesap «${f === 'post' ? 'gönderi' : 'hikâye'}» yayımlayamaz`
            : `Hesap kullanılamıyor: ${TARGET_BLOCKER_TEXT[b]}`,
        reconnect: reconnect && canManageAccount(actor, account.ownership),
        hidden: false,
      }
    }
    if (!scope.formats.includes(f)) {
      return { ok: false, code: 'format_not_allowed', reason: `Biçim kapsamda kapalı: «${f === 'post' ? 'gönderi' : 'hikâye'}» bu hesabın yayın kapsamında izinli değil`, reconnect: false, hidden: false }
    }
  }
  const facts = newsFactsFrom(news.id, news.data)
  for (const f of formats) {
    const p = newsScopeProblemFor(scope, facts, f)
    if (p) {
      const what = f === 'story' ? 'hikâye' : 'gönderi'
      return {
        ok: false,
        code: p.code,
        reason: p.code === 'outside_location' ? `Konum kapsamı dışında (${what}): ${p.reason}` : `Kategori kapsamı dışında (${what}): ${p.reason}`,
        reconnect: false,
        hidden: false,
      }
    }
  }
  return { ok: true, scope }
}

/** Accounts the actor may consider for manual sharing (managed + editor-open corporate accounts). */
export async function listManualTargetAccounts(actor: SocialActor): Promise<SocialAccount[]> {
  const own = await listAccountsForActor(actor)
  const seen = new Map(own.map((a) => [a.id, a]))
  if (actor.isStaff && actor.newsPublisher && !actor.central) {
    const col = getAdminFirestore().collection(Collections.SOCIAL_ACCOUNTS)
    const snap = actor.staffScope
      ? actor.staffScope.provinces.length > 0
        ? await col.where('ownership.citySlug', 'in', actor.staffScope.provinces.slice(0, 30)).limit(200).get()
        : null
      : await col.limit(500).get()
    for (const d of snap?.docs ?? []) {
      const a = parseSocialAccount(d.id, d.data())
      if (!a || seen.has(a.id)) continue
      const kind = ownershipKind(a.ownership)
      if (kind !== 'central' && kind !== 'province') continue
      if (canUseForManual(actor, a.ownership, readPublishScope(a, supportedFormats(a)).manualAccess)) seen.set(a.id, a)
    }
  }
  return [...seen.values()].filter((a) => a.connectionMethod !== 'legacy')
}

export interface TargetOption {
  accountId: string
  platform: SocialAccount['platform']
  displayName: string
  username: string | null
  ownerKind: string
  citySlug: string | null
  selectable: boolean
  code: string | null
  reason: string | null
  reconnect: boolean
  canManage: boolean
}

export async function manualTargetsForNews(actor: SocialActor, newsId: string, formats: PublishFormat[], now: number): Promise<{ ok: true; options: TargetOption[] } | { ok: false; status: number; code: string }> {
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
  if (!snap.exists) return { ok: false, status: 404, code: 'news_not_found' }
  const data = snap.data() as Record<string, unknown>
  const accounts = await listManualTargetAccounts(actor)
  const options: TargetOption[] = []
  for (const a of accounts) {
    const c = manualTargetCheck(actor, a, { id: newsId, data }, formats.filter((f) => f !== 'story' || a.platform !== 'threads'), now)
    if (!c.ok && c.hidden) continue
    options.push({
      accountId: a.id,
      platform: a.platform,
      displayName: a.displayName,
      username: a.username,
      ownerKind: ownershipKind(a.ownership) ?? 'province',
      citySlug: a.ownership.citySlug,
      selectable: c.ok,
      code: c.ok ? null : c.code,
      reason: c.ok ? null : c.reason,
      reconnect: c.ok ? false : c.reconnect,
      canManage: canManageAccount(actor, a.ownership),
    })
  }
  options.sort((x, y) => Number(y.selectable) - Number(x.selectable) || x.displayName.localeCompare(y.displayName, 'tr'))
  return { ok: true, options }
}
