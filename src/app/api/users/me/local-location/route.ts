import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isUserProfilesEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'
import { getCityCategoryName, normalizeCitySlug } from '@/constants/cities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Authenticated Yerel location preference (account authority).
 * Does not use IP. Clear is explicit and sticky until a new pick.
 */
export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }
  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await isUserProfilesEffectiveForUser(auth.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'User profiles disabled' }, { status: 404 })
  }

  const loc = await socialGraphRepository.getLocalNewsLocation(auth.uid)
  return NextResponse.json({
    citySlug: loc.citySlug,
    districtSlug: loc.districtSlug,
    cleared: loc.cleared,
    cityDisplay: loc.citySlug ? getCityCategoryName(loc.citySlug) : null,
    country: loc.country,
  })
}

export async function PUT(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }
  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const allowed = await isUserProfilesEffectiveForUser(auth.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'User profiles disabled' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    citySlug?: string | null
    districtSlug?: string | null
    clear?: boolean
  }

  if (body.clear) {
    await socialGraphRepository.setLocalNewsLocation({
      firebaseUid: auth.uid,
      citySlug: null,
      districtSlug: null,
      clear: true,
    })
    return NextResponse.json({
      ok: true,
      citySlug: null,
      districtSlug: null,
      cleared: true,
    })
  }

  const rawSlug = typeof body.citySlug === 'string' ? body.citySlug.trim().toLowerCase() : null
  const citySlug = rawSlug ? normalizeCitySlug(rawSlug) || rawSlug : null
  if (!citySlug) {
    return NextResponse.json({ error: 'citySlug required (or clear=true)' }, { status: 400 })
  }
  const districtSlug =
    typeof body.districtSlug === 'string' && body.districtSlug.trim()
      ? body.districtSlug.trim().toLowerCase()
      : null

  await socialGraphRepository.setLocalNewsLocation({
    firebaseUid: auth.uid,
    citySlug,
    districtSlug,
    clear: false,
  })

  return NextResponse.json({
    ok: true,
    citySlug,
    districtSlug,
    cleared: false,
    cityDisplay: getCityCategoryName(citySlug),
  })
}
