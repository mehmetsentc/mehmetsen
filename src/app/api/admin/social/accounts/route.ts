/**
 * GET /api/admin/social/accounts — connected accounts (public model only) +
 * per-platform configuration readiness (env var NAMES only, never values).
 * Auth: central social-account manager (system:settings, unscoped).
 */
import { actorFromCms } from '@/lib/social/accounts/actor'
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { allConfigStatuses, listManagedAccounts } from '@/lib/social/accounts/connect/flows'
import { toPublicSocialAccount } from '@/lib/social/accounts/types'
import { socialTestEnvStatus } from '@/lib/social/testEnvironment'
import { legacyAccountId } from '@/lib/social/accounts/legacyLock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const accounts = (await listManagedAccounts(actorFromCms(auth.ctx.uid, auth.ctx))) ?? []
  const config = allConfigStatuses()
  // Which connected account is the SAME external account as the old Onyeditivi
  // credentials (account ids only — no token, no secret).
  const [fb, ig, th] = await Promise.all((['facebook', 'instagram', 'threads'] as const).map((p) => legacyAccountId(p).catch(() => null)))
  return json({
    accounts: accounts.map(toPublicSocialAccount),
    legacyAccountIds: { facebook: fb, instagram: ig, threads: th },
    config: Object.fromEntries(
      Object.entries(config).map(([k, v]) => [k, { ready: v.ready, missing: v.missing, redirectUri: v.redirectUri, appId: v.appId ?? null }]),
    ),
    autoShareEnabledByConnection: false,
    // Test (preview) ortamı durumu — yalnızca değişken ADLARI, değer yok.
    testEnvironment: socialTestEnvStatus(),
  })
}
