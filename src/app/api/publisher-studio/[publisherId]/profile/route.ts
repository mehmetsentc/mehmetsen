import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { requireStudioAuth, studioDisabledResponse, studioErrorResponse } from '@/lib/publisher/studioApi'
import { publisherProfileService } from '@/services/publisher/publisherLayoutService'
import { publisherRepository } from '@/services/publisher/publisherRepository'
import { isAllowedPublisherAccent } from '@/lib/publisher/accentPalette'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  const { publisherId } = await context.params
  try {
    await requireStudioAuth(request, publisherId, 'profile:read')
    const publisher = await publisherRepository.findById(publisherId)
    if (!publisher) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ publisher })
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  const { publisherId } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if ('primaryDomain' in body || 'verificationStatus' in body || 'status' in body || 'slug' in body) {
    return NextResponse.json({ error: 'Field not editable' }, { status: 400 })
  }
  if (
    'accentColorHex' in body &&
    body.accentColorHex !== null &&
    typeof body.accentColorHex !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid accentColorHex' }, { status: 400 })
  }
  if ('accentColorHex' in body && !isAllowedPublisherAccent(body.accentColorHex as string | null)) {
    return NextResponse.json({ error: 'Accent color must be chosen from the curated palette' }, { status: 400 })
  }
  try {
    const { user } = await requireStudioAuth(request, publisherId, 'profile:edit')
    const publisher = await publisherProfileService.updateProfile(publisherId, user.uid, {
      displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
      description: body.description === null || typeof body.description === 'string' ? body.description : undefined,
      logoUrl: body.logoUrl === null || typeof body.logoUrl === 'string' ? body.logoUrl : undefined,
      coverImageUrl:
        body.coverImageUrl === null || typeof body.coverImageUrl === 'string'
          ? body.coverImageUrl
          : undefined,
      city: body.city === null || typeof body.city === 'string' ? body.city : undefined,
      district: body.district === null || typeof body.district === 'string' ? body.district : undefined,
      countryCode:
        body.countryCode === null || typeof body.countryCode === 'string' ? body.countryCode : undefined,
      websiteUrl:
        body.websiteUrl === null || typeof body.websiteUrl === 'string' ? body.websiteUrl : undefined,
      accentColorHex:
        body.accentColorHex === null || typeof body.accentColorHex === 'string'
          ? body.accentColorHex
          : undefined,
    })
    return NextResponse.json({ publisher })
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}
