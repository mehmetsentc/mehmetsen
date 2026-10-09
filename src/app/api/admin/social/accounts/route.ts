/**
 * GET /api/admin/social/accounts — connected accounts (public model only) +
 * per-platform configuration readiness (env var NAMES only, never values).
 * Auth: central social-account manager (system:settings, unscoped).
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { allConfigStatuses, listManagedAccounts } from '@/lib/social/accounts/connect/flows'
import { toPublicSocialAccount } from '@/lib/social/accounts/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const accounts = (await listManagedAccounts(auth.ctx)) ?? []
  const config = allConfigStatuses()
  return json({
    accounts: accounts.map(toPublicSocialAccount),
    config: Object.fromEntries(
      Object.entries(config).map(([k, v]) => [k, { ready: v.ready, missing: v.missing, redirectUri: v.redirectUri }]),
    ),
    autoShareEnabledByConnection: false,
  })
}
