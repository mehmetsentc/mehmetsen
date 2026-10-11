/** GET /api/social/accounts — accounts the signed-in user may see, with separate connection / permission / automation states. */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json } from '@/lib/social/accounts/connect/routeHelpers'
import { accountsForActor } from '@/lib/social/actorSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ accounts: await accountsForActor(auth.actor) })
}
