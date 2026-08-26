import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isUserProfilesEnabled } from '@/lib/social/featureFlag'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
  if (!isUserProfilesEnabled()) {
    return NextResponse.json({ error: 'User profiles disabled' }, { status: 404 })
  }
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  try {
    await socialGraphRepository.upsertProfile({
      firebaseUid: auth.uid,
      email: auth.email,
      username: typeof body.username === 'string' ? body.username : undefined,
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl : body.avatarUrl === null ? null : undefined,
      bio: typeof body.bio === 'string' ? body.bio : body.bio === null ? null : undefined,
      city: typeof body.city === 'string' ? body.city : body.city === null ? null : undefined,
      country: typeof body.country === 'string' ? body.country : body.country === null ? null : undefined,
      interests: Array.isArray(body.interests)
        ? body.interests.filter((i): i is string => typeof i === 'string')
        : undefined,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Update failed'
    const status =
      msg === 'USERNAME_TAKEN' || msg === 'USERNAME_RATE_LIMIT' ? 409 : msg.includes('Kullanıcı adı') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
