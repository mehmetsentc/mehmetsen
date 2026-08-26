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

  const { id } = await context.params
  try {
    const result = await publisherClaimService.approvePublisherClaim({
      claimId: id,
      reviewedBy: auth.uid,
    })
    return NextResponse.json({
      ...result,
      alreadyApproved: result.alreadyApproved,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Approve failed'
    const status =
      msg === 'CLAIM_NOT_FOUND' ? 404 : msg.includes('ALREADY') || msg.includes('NOT_PENDING') ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
