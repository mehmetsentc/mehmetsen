import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  requireStudioAuth,
  studioErrorResponse,
  StudioRouteError,
} from '@/lib/publisher/studioApi'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import {
  getPublisherSetupStatus,
  onboardingDismissCookieName,
} from '@/services/publisher/publisherSetupStatusService'
import { publisherLog } from '@/lib/publisher/observability'

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
    const jar = await cookies()
    const dismissed = jar.get(onboardingDismissCookieName(publisherId))?.value === '1'
    const status = await getPublisherSetupStatus(publisherId, dismissed)
    return NextResponse.json({ status })
  } catch (err) {
    return studioErrorResponse(err)
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  const { publisherId } = await context.params
  try {
    const auth = await requireStudioAuth(request, publisherId, 'profile:edit')
    const body = (await request.json().catch(() => ({}))) as { dismiss?: boolean }
    if (body.dismiss) {
      const jar = await cookies()
      jar.set(onboardingDismissCookieName(publisherId), '1', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })
      publisherLog('publisher_onboarding_checklist_dismissed', {
        publisherId,
        userId: auth.user.uid,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof StudioRouteError) return studioErrorResponse(err)
    return studioErrorResponse(err)
  }
}
