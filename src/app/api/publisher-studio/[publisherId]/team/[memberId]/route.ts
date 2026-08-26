import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { ASSIGNABLE_MEMBER_ROLES } from '@/lib/publisher/authorization'
import { requireStudioAuth, studioDisabledResponse, studioErrorResponse } from '@/lib/publisher/studioApi'
import { publisherRepository } from '@/services/publisher/publisherRepository'
import type { PublisherMemberRole } from '@/types/publisher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string; memberId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  const { publisherId, memberId } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const role = typeof body.role === 'string' ? (body.role as PublisherMemberRole) : null
  if (!role || !ASSIGNABLE_MEMBER_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  try {
    const { member: actor } = await requireStudioAuth(request, publisherId, 'team:manage')
    if (actor.role !== 'OWNER') {
      return NextResponse.json({ error: 'Only OWNER can change roles' }, { status: 403 })
    }
    const target = (await publisherRepository.listMembersForPublisher(publisherId)).find(
      (m) => m.id === memberId
    )
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (target.role === 'OWNER') {
      return NextResponse.json({ error: 'Cannot change OWNER role via dropdown' }, { status: 400 })
    }
    const updated = await publisherRepository.updateMemberRole(publisherId, memberId, role)
    return NextResponse.json({ member: updated })
  } catch (err) {
    if (err instanceof Error && err.message === 'DISABLED') return studioDisabledResponse()
    return studioErrorResponse(err)
  }
}
