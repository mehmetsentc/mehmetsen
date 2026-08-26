import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isUserProfilesEnabled } from '@/lib/social/featureFlag'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  if (!isUserProfilesEnabled()) {
    return NextResponse.json({ error: 'User profiles disabled' }, { status: 404 })
  }
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { username } = await context.params
  const profile = await socialGraphRepository.getPublicProfileByUsername(username)
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ profile })
}
