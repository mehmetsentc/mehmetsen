import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import {
  isAdBookingRequestsEnabled,
  isAdCreativeSubmissionEnabled,
  isAdMarketplaceEnabled,
  isAdvertiserPlatformEnabled,
} from '@/lib/advertiser/marketplaceFlags'
import {
  advertiserRoleHasPermission,
  type AdvertiserPermission,
} from '@/lib/advertiser/authorization'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { MarketplaceError } from '@/services/advertiser/advertiserMarketplaceService'
import { advertiserMarketplaceRepository } from '@/services/advertiser/advertiserMarketplaceRepository'
import { PublisherStudioAuthError } from '@/services/publisher/publisherLayoutService'

export function marketplaceDisabledResponse() {
  return NextResponse.json({ error: 'Marketplace disabled', code: 'FLAG_OFF' }, { status: 404 })
}

export function advertiserPlatformGuard() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  if (!isAdvertiserPlatformEnabled()) return marketplaceDisabledResponse()
  return null
}

export function marketplaceBrowseGuard() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  if (!isAdMarketplaceEnabled()) return marketplaceDisabledResponse()
  return null
}

export function bookingGuard() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  if (!isAdBookingRequestsEnabled()) return marketplaceDisabledResponse()
  return null
}

export function creativeGuard() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  if (!isAdCreativeSubmissionEnabled()) return marketplaceDisabledResponse()
  return null
}

export async function requireAdvertiserAuth(
  request: Request,
  advertiserId: string,
  permission: AdvertiserPermission
) {
  const guard = advertiserPlatformGuard()
  if (guard) return { error: guard as NextResponse }

  const user = await verifyUserRequest(request)
  if (!user) {
    return {
      error: NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    }
  }

  // Server-side membership — ignore any client-spoofed advertiser claims
  const member = await advertiserMarketplaceRepository.findMember(advertiserId, user.uid)
  if (!member) {
    return {
      error: NextResponse.json({ error: 'FORBIDDEN', code: 'NOT_MEMBER' }, { status: 403 }),
    }
  }
  if (!advertiserRoleHasPermission(member.role, permission)) {
    return {
      error: NextResponse.json({ error: 'FORBIDDEN', code: 'FORBIDDEN' }, { status: 403 }),
    }
  }

  const advertiser = await advertiserMarketplaceRepository.findAdvertiserById(advertiserId)
  if (!advertiser) {
    return {
      error: NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }),
    }
  }

  return { user, member, advertiser }
}

export function marketplaceErrorResponse(err: unknown) {
  if (err instanceof PublisherStudioAuthError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.code === 'NOT_MEMBER' || err.code === 'FORBIDDEN' ? 403 : 401 }
    )
  }
  if (err instanceof MarketplaceError) {
    const status =
      err.code === 'FLAG_OFF' || err.code === 'DISABLED'
        ? 404
        : err.code === 'FORBIDDEN' || err.code === 'SUSPENDED'
          ? 403
          : err.code === 'NOT_FOUND'
            ? 404
            : err.code === 'INVENTORY_DATE_CONFLICT' ||
                err.code === 'CONFLICT' ||
                err.code === 'ALREADY_PROCESSED'
              ? 409
              : 400
    return NextResponse.json({ error: err.message, code: err.code }, { status })
  }
  const msg = err instanceof Error ? err.message : 'Request failed'
  return NextResponse.json({ error: msg }, { status: 500 })
}

export function serializeDates<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Date) out[k] = v.toISOString()
    else out[k] = v
  }
  return out
}
