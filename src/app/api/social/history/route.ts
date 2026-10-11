/** GET /api/social/history?accountId= — publish ledger + automation jobs of the user's own (publishable) accounts. */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json } from '@/lib/social/accounts/connect/routeHelpers'
import { historyForActor } from '@/lib/social/actorSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  const accountId = new URL(request.url).searchParams.get('accountId')
  return json(await historyForActor(auth.actor, accountId && /^[a-z]+_[0-9]{1,30}$/.test(accountId) ? accountId : null))
}
