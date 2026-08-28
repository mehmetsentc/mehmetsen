import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { getDb, hasDatabaseUrl } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { userFeatureAccessService } from '@/services/user/userFeatureAccessService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(_request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const { userId } = await context.params
  const db = getDb()
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, userId))
    .limit(1)

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const resolved = await userFeatureAccessService.resolveAll(userId)
  const rows = await userFeatureAccessService.listRows(userId)
  return NextResponse.json({
    userId,
    email: user.email,
    username: user.username,
    role: user.role,
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

  const { userId } = await context.params
  const db = getDb()
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.firebaseUid, userId))
    .limit(1)

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const featureKey = typeof body.featureKey === 'string' ? body.featureKey : ''
  const enabled = body.enabled === true
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null
  const grantPilot = body.grantPilotBundle === true
  const revokePilot = body.revokePilotBundle === true

  try {
    if (revokePilot) {
      const revoked = await userFeatureAccessService.revokePilotBundle({
        userId,
        actorId: auth.uid,
      })
      return NextResponse.json({ ok: true, revoked })
    }

    if (grantPilot) {
      const results = await userFeatureAccessService.grantPilotBundle({
        userId,
        actorId: auth.uid,
        reason,
      })
      return NextResponse.json({ ok: true, granted: results.length })
    }

    const record = await userFeatureAccessService.setFeatureAccess({
      userId,
      featureKey,
      enabled,
      actorId: auth.uid,
      reason,
    })
    return NextResponse.json({ ok: true, record })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed'
    const status =
      msg.startsWith('MISSING_DEPS') ||
      msg === 'UNKNOWN_FEATURE' ||
      msg === 'NOT_ALLOWLISTABLE'
        ? 400
        : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
