import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  getCanonicalNewsRightsReview,
  isNewsRightsBasis,
  isNewsRightsStatus,
  recordNewsRightsDecision,
} from '@/services/editorial/newsRightsDecision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const PILOT_HINT = new Set([
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
])

export async function GET(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const review = await getCanonicalNewsRightsReview(id)
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    review,
    pilotHint: PILOT_HINT.has(id),
    note: 'P18.4D.2 rights foundation — decisions are human-only; this GET never clears rights.',
  })
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as {
    status?: string
    basis?: string
  } | null

  if (!body || !isNewsRightsStatus(body.status) || !isNewsRightsBasis(body.basis)) {
    return NextResponse.json(
      { error: 'Invalid status/basis', allowedStatus: true, allowedBasis: true },
      { status: 400 }
    )
  }

  try {
    const result = await recordNewsRightsDecision({
      newsId: id,
      actorUid: auth.uid,
      status: body.status,
      basis: body.basis,
      refuseClearWhenBlocked: true,
    })
    const review = await getCanonicalNewsRightsReview(id)
    return NextResponse.json({
      ok: true,
      result,
      review,
      published: false,
      executePublish: false,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'rights_decision_failed'
    const status =
      msg.includes('automation') || msg.includes('not_trusted') || msg.includes('missing')
        ? 403
        : msg.includes('blocked')
          ? 409
          : 400
    return NextResponse.json({ error: msg, published: false }, { status })
  }
}
