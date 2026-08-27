import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { hasDatabaseUrl } from '@/db'
import { publisherFeatureAccessService } from '@/services/publisher/publisherFeatureAccessService'
import { publisherRepository } from '@/services/publisher/publisherRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(_request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const { id } = await context.params
  const publisher = await publisherRepository.findById(id)
  if (!publisher) return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })

  const resolved = await publisherFeatureAccessService.resolveAll(id)
  const rows = await publisherFeatureAccessService.listRows(id)
  return NextResponse.json({
    publisherId: id,
    slug: publisher.slug,
    verificationStatus: publisher.verificationStatus,
    resolved,
    rows,
  })
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const featureKey = typeof body.featureKey === 'string' ? body.featureKey : ''
  const enabled = body.enabled === true
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null
  const grantPilot = body.grantPilotBundle === true

  try {
    if (grantPilot) {
      const results = await publisherFeatureAccessService.grantPilotBundle({
        publisherId: id,
        actorId: auth.uid,
        note,
      })
      return NextResponse.json({ ok: true, granted: results.length })
    }

    const record = await publisherFeatureAccessService.setFeatureAccess({
      publisherId: id,
      featureKey,
      enabled,
      actorId: auth.uid,
      note,
    })
    return NextResponse.json({ ok: true, record })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed'
    const status =
      msg === 'PUBLISHER_NOT_FOUND'
        ? 404
        : msg === 'PUBLISHER_NOT_VERIFIED' ||
            msg.startsWith('MISSING_DEPS') ||
            msg === 'UNKNOWN_FEATURE' ||
            msg === 'NOT_ALLOWLISTABLE'
          ? 400
          : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
