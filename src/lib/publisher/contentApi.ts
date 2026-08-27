import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import {
  requireStudioAuth,
  studioDisabledResponse,
  studioErrorResponse,
  StudioRouteError,
} from '@/lib/publisher/studioApi'
import { isPublisherContentStudioEnabled } from '@/lib/publisher/contentFlags'
import { PublisherContentError } from '@/services/publisher/publisherContentService'
import type { PublisherPermission } from '@/lib/publisher/authorization'
import type { PublisherContentItem } from '@/types/publisherContent'

export function contentStudioGuard() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  if (!isPublisherContentStudioEnabled()) {
    return studioDisabledResponse()
  }
  return null
}

export async function withContentAuth(
  request: Request,
  publisherId: string,
  permission: PublisherPermission
) {
  const guard = contentStudioGuard()
  if (guard) return { error: guard as NextResponse }
  try {
    const auth = await requireStudioAuth(request, publisherId, permission)
    return { auth }
  } catch (err) {
    return { error: contentErrorResponse(err) }
  }
}

export function contentErrorResponse(err: unknown) {
  if (err instanceof StudioRouteError) {
    if (err.message === 'DISABLED') return studioDisabledResponse()
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  if (err instanceof PublisherContentError) {
    const status =
      err.code === 'DISABLED' || err.code === 'FLAG_OFF'
        ? 404
        : err.code === 'FORBIDDEN'
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

export function serializeContent(item: PublisherContentItem) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    publishedAt: item.publishedAt?.toISOString() ?? null,
    scheduledAt: item.scheduledAt?.toISOString() ?? null,
    scheduleClaimedAt: item.scheduleClaimedAt?.toISOString() ?? null,
    scheduleClaimExpiresAt: item.scheduleClaimExpiresAt?.toISOString() ?? null,
    publicationClaimedAt: item.publicationClaimedAt?.toISOString() ?? null,
  }
}
