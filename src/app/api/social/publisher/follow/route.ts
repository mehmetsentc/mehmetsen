import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function disabled() {
  return NextResponse.json({ error: 'Social graph disabled' }, { status: 404 })
}

function noDb() {
  return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) return noDb()

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await isSocialGraphEffectiveForUser(auth.uid)
  if (!allowed) return disabled()

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const publisherId = typeof body.publisherId === 'string' ? body.publisherId.trim() : ''
  if (!publisherId) return NextResponse.json({ error: 'publisherId required' }, { status: 400 })

  try {
    const created = await socialGraphRepository.followPublisher(auth.uid, publisherId, auth.email)
    const followerCount = await socialGraphRepository.getPublisherFollowerCount(publisherId)
    return NextResponse.json({ following: true, created, followerCount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Follow failed'
    const status = msg === 'PUBLISHER_NOT_FOUND' ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
