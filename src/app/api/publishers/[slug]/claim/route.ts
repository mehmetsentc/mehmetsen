import { NextResponse } from 'next/server'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { hasDatabaseUrl } from '@/db'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'
import { publisherClaimService } from '@/services/publisher/publisherClaimService'
import { publisherRepository } from '@/services/publisher/publisherRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ slug: string }>
}

export async function POST(request: Request, context: RouteContext) {
  if (!isPublisherPlatformEnabled()) {
    return NextResponse.json({ error: 'Publisher platform disabled' }, { status: 404 })
  }
  const user = await verifyUserRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const { slug } = await context.params
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  // Security: ignore any role/member hints from client — claim flow only
  if ('role' in body || 'memberRole' in body || 'publisherId' in body) {
    return NextResponse.json({ error: 'Invalid request fields' }, { status: 400 })
  }

  try {
    const claim = await publisherClaimService.requestPublisherClaim({
      publisherId: publisher.id,
      userId: user.uid,
      userEmail: user.email,
      requestedDomain: typeof body.requestedDomain === 'string' ? body.requestedDomain : null,
      businessEmail: typeof body.businessEmail === 'string' ? body.businessEmail : user.email,
      verificationMethod: 'MANUAL',
      verificationPayload:
        typeof body.message === 'string' ? { message: body.message.slice(0, 500) } : null,
    })
    return NextResponse.json({ claimId: claim.id, status: claim.status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claim failed'
    const status =
      msg === 'PUBLISHER_NOT_FOUND'
        ? 404
        : msg.includes('ALREADY') || msg.includes('PENDING')
          ? 409
          : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
