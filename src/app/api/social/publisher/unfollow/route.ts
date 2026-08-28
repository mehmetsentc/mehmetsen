import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await isSocialGraphEffectiveForUser(auth.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Social graph disabled' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const publisherId = typeof body.publisherId === 'string' ? body.publisherId.trim() : ''
  if (!publisherId) return NextResponse.json({ error: 'publisherId required' }, { status: 400 })

  const removed = await socialGraphRepository.unfollowPublisher(auth.uid, publisherId)
  const followerCount = await socialGraphRepository.getPublisherFollowerCount(publisherId)
  return NextResponse.json({ following: false, removed, followerCount })
}
