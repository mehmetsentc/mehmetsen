/**
 * GET /api/admin/social/threads-identity — READ-ONLY Threads identity check (Görev 18).
 *
 * Answers one question: is the legacy (env) Threads configuration the same
 * real Threads profile as the officially connected (OAuth) Threads account?
 *
 * - Legacy side: GET graph.threads.net/me?fields=id,username with the legacy
 *   token (no container, no publish, no write anywhere).
 * - OAuth side: the stored account documents (externalId, username) — no
 *   Meta call.
 * - Never changes ids, ledger records or the legacy hand-off. Tokens and app
 *   secrets are never returned or logged.
 *
 * Central social-account managers only.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { actorFromCms } from '@/lib/social/accounts/actor'
import { listManagedAccounts } from '@/lib/social/accounts/connect/flows'
import { THREADS_GRAPH_BASE } from '@/lib/social/graphConfig'
import { sanitizeFreeText } from '@/lib/social/safeLog'
import { metaRequest, query } from '@/lib/social/accounts/connect/metaHttp'
import { isSocialTestMode } from '@/lib/social/testEnvironment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Verdict =
  | 'not_configured'
  | 'legacy_token_rejected'
  | 'no_oauth_account'
  | 'same_id'
  | 'same_profile_different_id'
  | 'different_profile'
  | 'env_id_mismatch'

const VERDICT_TEXT: Record<Verdict, string> = {
  not_configured: 'Eski (env) Threads yapılandırması yok.',
  legacy_token_rejected: 'Eski Threads anahtarı platform tarafından kabul edilmedi; profil doğrulanamadı.',
  no_oauth_account: 'Resmî (OAuth) bağlı Threads hesabı yok.',
  same_id: 'Aynı Threads kimliği: eski yapılandırma ile resmî bağlantı aynı hesap ve aynı kimlik.',
  same_profile_different_id:
    'Aynı Threads profili (aynı kullanıcı adı), farklı kimlik numarası. Threads kullanıcı kimlikleri uygulamaya özeldir: eski Onyeditivi uygulaması ile NaHaber Threads uygulaması aynı profile farklı kimlik verir. Bu farklı bir hesap değil, eski yapılandırmanın başka uygulamaya ait kimliğidir.',
  different_profile: 'Farklı Threads profili: eski yapılandırma başka bir hesaba ait.',
  env_id_mismatch: 'Eski anahtarın döndürdüğü kimlik env THREADS_USER_ID ile aynı değil (eski yapılandırma kendi içinde tutarsız).',
}

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response

  // Test (preview) ortamında eski Onyeditivi anahtarları hiç okunmaz.
  const testMode = isSocialTestMode()
  const envUserId = testMode ? '' : process.env.THREADS_USER_ID?.trim() || ''
  const legacyToken = testMode ? '' : process.env.THREADS_ACCESS_TOKEN?.trim() || ''

  const accounts = ((await listManagedAccounts(actorFromCms(auth.ctx.uid, auth.ctx))) ?? []).filter((a) => a.platform === 'threads')
  const oauth = accounts.map((a) => ({
    accountId: a.id,
    externalId: a.externalId,
    username: a.username ?? null,
    status: a.status,
    connectionMethod: a.connectionMethod,
  }))

  let legacy: { configured: boolean; envUserId: string | null; tokenUserId: string | null; username: string | null; checked: boolean; error: string | null } = {
    configured: !!(envUserId && legacyToken),
    envUserId: envUserId || null,
    tokenUserId: null,
    username: null,
    checked: false,
    error: null,
  }

  if (legacy.configured) {
    // Read-only GET; same helper the connection check uses (exact large ids, safe errors).
    const r = await metaRequest<{ id?: string | number; username?: string }>('threads_identity_me', query(`${THREADS_GRAPH_BASE}/me`, { fields: 'id,username', access_token: legacyToken }))
    if (r.ok && r.data.id !== undefined) {
      legacy = { ...legacy, checked: true, tokenUserId: String(r.data.id), username: r.data.username ?? null }
    } else if (!r.ok) {
      const e = r.error
      legacy = { ...legacy, checked: true, error: sanitizeFreeText(`HTTP ${e.status}${e.code !== null ? `, kod ${e.code}${e.subcode !== null ? `/${e.subcode}` : ''}` : ''}`, 80) }
    } else {
      legacy = { ...legacy, checked: true, error: 'Kimlik dönmedi' }
    }
  }

  const norm = (u: string | null) => (u ?? '').trim().replace(/^@/, '').toLowerCase()
  let verdict: Verdict
  if (!legacy.configured) verdict = 'not_configured'
  else if (!legacy.tokenUserId) verdict = 'legacy_token_rejected'
  else if (oauth.length === 0) verdict = 'no_oauth_account'
  else if (oauth.some((o) => o.externalId === legacy.tokenUserId || o.externalId === legacy.envUserId)) verdict = 'same_id'
  else if (legacy.username && oauth.some((o) => norm(o.username) === norm(legacy.username))) verdict = 'same_profile_different_id'
  else verdict = 'different_profile'

  return json({
    verdict,
    text: VERDICT_TEXT[verdict],
    envConsistent: legacy.tokenUserId ? legacy.tokenUserId === legacy.envUserId : null,
    envConsistencyText: legacy.tokenUserId && legacy.tokenUserId !== legacy.envUserId ? VERDICT_TEXT.env_id_mismatch : null,
    legacy: { configured: legacy.configured, envUserId: legacy.envUserId, tokenUserId: legacy.tokenUserId, username: legacy.username, error: legacy.error },
    oauth,
    note: 'Salt okunur kontrol: kimlikler eşitlenmez, ledger geçmişi ve eski yol devri değiştirilmez.',
  })
}
