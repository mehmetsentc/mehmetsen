import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { isStudioEffectiveForPublisher } from '@/lib/publisher/effectiveFlags'
import { publisherRepository } from '@/services/publisher/publisherRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await verifyUserRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const all = await publisherRepository.listPublishersForUser(user.uid)
  if (isPublisherStudioEnabled()) {
    return NextResponse.json({ publishers: all })
  }

  const publishers = []
  for (const p of all) {
    if (await isStudioEffectiveForPublisher(p.id)) publishers.push(p)
  }
  return NextResponse.json({ publishers })
}
