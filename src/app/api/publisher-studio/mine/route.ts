import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { studioDisabledResponse } from '@/lib/publisher/studioApi'
import { publisherRepository } from '@/services/publisher/publisherRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isPublisherStudioEnabled()) return studioDisabledResponse()
  const user = await verifyUserRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const publishers = await publisherRepository.listPublishersForUser(user.uid)
  return NextResponse.json({ publishers })
}
