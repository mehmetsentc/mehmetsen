/** GET /api/social/history?accountId= — publish ledger + automation jobs of the user's own (publishable) accounts. */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json } from '@/lib/social/accounts/connect/routeHelpers'
import { historyForActor } from '@/lib/social/actorSocial'
import { isWellFormedAccountId } from '@/lib/social/accounts/accountStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  const accountId = new URL(request.url).searchParams.get('accountId')
  // A requested account id must be honoured exactly: the old numeric-only check
  // rejected YouTube / TikTok ids and silently fell back to EVERY account's
  // history. Malformed ids are refused instead of widening the result.
  if (accountId !== null && !isWellFormedAccountId(accountId)) return json({ error: 'invalid_account_id', code: 'invalid_account_id' }, 400)
  return json(await historyForActor(auth.actor, accountId))
}
