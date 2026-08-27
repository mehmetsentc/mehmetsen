import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import {
  requireStudioAuth,
  studioDisabledResponse,
  studioErrorResponse,
  StudioRouteError,
} from '@/lib/publisher/studioApi'
import { isSelfManagedAdsEffectiveForPublisher } from '@/lib/publisher/effectiveFlags'
import { PublisherManagedAdsError } from '@/services/publisher/publisherManagedAdsService'
import type { PublisherPermission } from '@/lib/publisher/authorization'
import type {
  PublisherAdCreativeRecord,
  PublisherManagedAdRecord,
} from '@/types/publisherManagedAds'

export async function selfManagedAdsGuard(publisherId: string) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  if (!(await isSelfManagedAdsEffectiveForPublisher(publisherId))) {
    return studioDisabledResponse()
  }
  return null
}

export async function withSelfManagedAdsAuth(
  request: Request,
  publisherId: string,
  permission: PublisherPermission
) {
  const guard = await selfManagedAdsGuard(publisherId)
  if (guard) return { error: guard as NextResponse }
  try {
    const auth = await requireStudioAuth(request, publisherId, permission)
    return { auth }
  } catch (err) {
    return { error: selfManagedAdsErrorResponse(err) }
  }
}

export function selfManagedAdsErrorResponse(err: unknown) {
  if (err instanceof StudioRouteError) {
    if (err.message === 'DISABLED') return studioDisabledResponse()
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  if (err instanceof PublisherManagedAdsError) {
    const status =
      err.code === 'DISABLED' || err.code === 'FLAG_OFF'
        ? 404
        : err.code === 'FORBIDDEN' ||
            err.code === 'UNVERIFIED' ||
            err.code === 'UNCLAIMED' ||
            err.code === 'SUSPENDED'
          ? 403
          : err.code === 'NOT_FOUND'
            ? 404
            : err.code === 'CONFLICT'
              ? 409
              : 400
    return NextResponse.json({ error: err.message, code: err.code }, { status })
  }
  return studioErrorResponse(err)
}

export function serializeManagedAd(ad: PublisherManagedAdRecord) {
  return {
    ...ad,
    startAt: ad.startAt.toISOString(),
    endAt: ad.endAt.toISOString(),
    createdAt: ad.createdAt.toISOString(),
    updatedAt: ad.updatedAt.toISOString(),
    archivedAt: ad.archivedAt?.toISOString() ?? null,
  }
}

export function serializeCreative(c: PublisherAdCreativeRecord) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}
