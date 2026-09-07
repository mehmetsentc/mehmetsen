import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  getCanonicalNewsRightsReview,
  isNewsRightsBasis,
  isNewsRightsStatus,
  recordNewsRightsDecision,
} from '@/services/editorial/newsRightsDecision'
import { resolveCanonicalNewsSources } from '@/services/editorial/canonicalSourceProvenance'

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

  // P16.2B — read-only bridge: existing cluster_memberships PRIMARY/SUPPORTING
  // lineage, surfaced for human review only. Never affects rights decisions
  // (POST below never reads this field) and defaults to [] on any failure —
  // an empty list here must never be read as "no rights" or as a blocker.
  let sources: Awaited<ReturnType<typeof resolveCanonicalNewsSources>> = []
  try {
    sources = await resolveCanonicalNewsSources(id)
  } catch (provenanceError) {
    console.warn('[canonical-news rights GET] resolveCanonicalNewsSources failed:', provenanceError)
  }

  return NextResponse.json({
    review,
    sources,
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
    editorialBlocker?: string | null
    actorUid?: string
    uid?: string
  } | null

  if (!body || !isNewsRightsStatus(body.status) || !isNewsRightsBasis(body.basis)) {
    return NextResponse.json(
      { error: 'Invalid status/basis', allowedStatus: true, allowedBasis: true },
      { status: 400 }
    )
  }

  // Client-supplied actor UID is ignored — session auth.uid is sole actor.
  void body.actorUid
  void body.uid

  try {
    const result = await recordNewsRightsDecision({
      newsId: id,
      actorUid: auth.uid,
      status: body.status,
      basis: body.basis,
      refuseClearWhenBlocked: true,
      editorialBlocker:
        body.status === 'REWRITE_REQUIRED' && body.editorialBlocker !== undefined
          ? body.editorialBlocker
          : undefined,
    })
    const review = await getCanonicalNewsRightsReview(id)
    return NextResponse.json({
      ok: true,
      result,
      review,
      published: false,
      executePublish: false,
      actorFromSession: true,
      clientActorIgnored: true,
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
