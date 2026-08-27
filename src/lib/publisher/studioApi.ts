import { NextResponse } from 'next/server'
import { verifyUserRequest } from '@/lib/userAuthServer'
import {
  isStudioEffectiveForPublisher,
} from '@/lib/publisher/effectiveFlags'
import {
  PublisherStudioAuthError,
  requirePublisherMember,
} from '@/services/publisher/publisherLayoutService'
import type { PublisherPermission } from '@/lib/publisher/authorization'
import { publisherRepository } from '@/services/publisher/publisherRepository'

export function studioDisabledResponse() {
  return NextResponse.json({ error: 'Publisher Studio disabled' }, { status: 404 })
}

export async function requireStudioAuth(
  request: Request,
  publisherId: string,
  permission: PublisherPermission
) {
  const studioOn = await isStudioEffectiveForPublisher(publisherId)
  if (!studioOn) {
    throw new StudioRouteError('DISABLED', 404)
  }
  const user = await verifyUserRequest(request)
  if (!user) throw new StudioRouteError('UNAUTHORIZED', 401)
  try {
    const member = await requirePublisherMember(publisherId, user.uid, permission, publisherRepository)
    return { user, member }
  } catch (err) {
    if (err instanceof PublisherStudioAuthError) {
      throw new StudioRouteError(err.code, err.code === 'NOT_MEMBER' ? 403 : 403)
    }
    throw err
  }
}

export class StudioRouteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export function studioErrorResponse(err: unknown) {
  if (err instanceof StudioRouteError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  const msg = err instanceof Error ? err.message : 'Request failed'
  const status =
    msg === 'LAYOUT_NOT_EDITABLE' || msg === 'LAYOUT_NOT_PUBLISHABLE'
      ? 409
      : msg === 'PUBLISHER_NOT_FOUND' || msg === 'LAYOUT_NOT_FOUND'
        ? 404
        : msg === 'LAYOUT_ROLLBACK_INVALID'
          ? 400
          : msg.includes('DUPLICATE') || msg.includes('duplicate')
            ? 409
            : 500
  return NextResponse.json({ error: msg }, { status })
}
