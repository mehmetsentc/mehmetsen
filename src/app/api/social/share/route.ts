/**
 * POST /api/social/share { newsId, accountId, format: 'post' | 'story' }
 * "Hesabımda yayımla": publishes a published, public, eligible news item to ONE
 * account the user may publish to. Always an explicit target (never the legacy
 * Onyeditivi credentials); no AI rewrite; the shared ledger blocks duplicates.
 * Success is reported only with the platform's post id.
 */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { shareForActor } from '@/lib/social/actorSocial'
import { extractImageUrl, isOwnContent, isSkippableForSocial, publishOneSocial } from '@/lib/social/publishOneSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const r = await shareForActor(
    auth.actor,
    {
      newsId: typeof body.newsId === 'string' ? body.newsId.trim() : '',
      accountId: typeof body.accountId === 'string' ? body.accountId.trim() : '',
      format: body.format === 'story' ? 'story' : body.format === 'post' ? 'post' : ('x' as 'post'),
    },
    { publish: publishOneSocial, helpers: { isOwnContent, isSkippableForSocial, extractImageUrl } },
  )
  if (!r.ok) return json({ error: r.message, code: r.code, ...(r.action ? { action: r.action } : {}), ...(r.ledgerStatus ? { ledgerStatus: r.ledgerStatus } : {}) }, r.status)
  return json({ result: r.result })
}
