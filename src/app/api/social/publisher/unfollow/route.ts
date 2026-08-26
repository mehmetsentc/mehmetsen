import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEnabled } from '@/lib/social/featureFlag'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSocialGraphEnabled()) {
    return NextResponse.json({ error: 'Social graph disabled' }, { status: 404 })
  }
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const publisherId = typeof body.publisherId === 'string' ? body.publisherId.trim() : ''
  if (!publisherId) return NextResponse.json({ error: 'publisherId required' }, { status: 400 })

  const removed = await socialGraphRepository.unfollowPublisher(auth.uid, publisherId)
  const followerCount = await socialGraphRepository.getPublisherFollowerCount(publisherId)
  return NextResponse.json({ following: false, removed, followerCount })
}
