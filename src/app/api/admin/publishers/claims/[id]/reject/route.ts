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
  const rejectionReason =
    typeof body.rejectionReason === 'string' ? body.rejectionReason.trim() : ''
  if (!rejectionReason) {
    return NextResponse.json({ error: 'rejectionReason required' }, { status: 400 })
  }

  const { id } = await context.params
  try {
    const result = await publisherClaimService.rejectPublisherClaim({
      claimId: id,
      reviewedBy: auth.uid,
      rejectionReason,
    })
    return NextResponse.json({
      claim: result.claim,
      alreadyRejected: result.alreadyRejected,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Reject failed'
    const status = msg === 'CLAIM_NOT_FOUND' ? 404 : msg.includes('NOT_PENDING') ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
