import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isUserProfilesEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { username } = await context.params
  const profile = await socialGraphRepository.getPublicProfileByUsername(username)
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const auth = await verifyUserRequest(request)
  const allowed =
    (await isUserProfilesEffectiveForUser(profile.userId)) ||
    (await isUserProfilesEffectiveForUser(auth?.uid))

  if (!allowed) {
    return NextResponse.json({ error: 'User profiles disabled' }, { status: 404 })
  }

  return NextResponse.json({ profile })
}
