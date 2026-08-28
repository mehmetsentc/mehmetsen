import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { hasDatabaseUrl } from '@/db'
import { publisherClaimService } from '@/services/publisher/publisherClaimService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const revocationReason =
    typeof body.revocationReason === 'string' ? body.revocationReason.trim() : undefined

  const { id } = await context.params
  try {
    const result = await publisherClaimService.revokePublisherClaim({
      claimId: id,
      reviewedBy: auth.uid,
      revocationReason,
    })
    return NextResponse.json({
      publisher: result.publisher,
      claim: result.claim,
      alreadyRevoked: result.alreadyRevoked,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Revoke failed'
    const status =
      msg === 'CLAIM_NOT_FOUND' || msg === 'PUBLISHER_NOT_FOUND'
        ? 404
        : msg.includes('NOT_APPROVED')
          ? 409
          : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
