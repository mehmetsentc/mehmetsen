import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import {
  requireStudioAuth,
  studioDisabledResponse,
  studioErrorResponse,
  StudioRouteError,
} from '@/lib/publisher/studioApi'
import { isPublisherAdInventoryEnabled } from '@/lib/publisher/adInventoryFlags'
import { PublisherAdInventoryError } from '@/services/publisher/publisherAdInventoryService'
import type { PublisherPermission } from '@/lib/publisher/authorization'
import type { PublisherAdInventoryRecord } from '@/types/publisherAdInventory'

export function adInventoryGuard() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  if (!isPublisherAdInventoryEnabled()) {
    return studioDisabledResponse()
  }
  return null
}

export async function withAdInventoryAuth(
  request: Request,
  publisherId: string,
  permission: PublisherPermission
) {
  const guard = adInventoryGuard()
  if (guard) return { error: guard as NextResponse }
  try {
    const auth = await requireStudioAuth(request, publisherId, permission)
    return { auth }
  } catch (err) {
    return { error: adInventoryErrorResponse(err) }
  }
}

export function adInventoryErrorResponse(err: unknown) {
  if (err instanceof StudioRouteError) {
    if (err.message === 'DISABLED') return studioDisabledResponse()
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  if (err instanceof PublisherAdInventoryError) {
    const status =
      err.code === 'DISABLED' || err.code === 'FLAG_OFF'
        ? 404
        : err.code === 'FORBIDDEN' || err.code === 'UNVERIFIED' || err.code === 'UNCLAIMED'
          ? 403
          : err.code === 'SUSPENDED'
            ? 403
            : err.code === 'NOT_FOUND'
              ? 404
              : 400
    return NextResponse.json({ error: err.message, code: err.code }, { status })
  }
  return studioErrorResponse(err)
}

export function serializeAdInventory(item: PublisherAdInventoryRecord) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    archivedAt: item.archivedAt?.toISOString() ?? null,
  }
}
