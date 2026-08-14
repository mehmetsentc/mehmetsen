import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  createRuleProposal,
  getActiveAlgorithmConfig,
  listRuleProposals,
  reviewRuleProposal,
  seedLearningProposals,
} from '@/services/newsroomOs/proposalService'
import type { RuleProposal } from '@/types/newsroomOs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function gateView(request: NextRequest) {
  return (
    (await verifyCmsToken(request, 'algorithm:view')) ||
    (await verifyCmsToken(request, 'ai:configure')) ||
    (await verifyCmsToken(request, 'ai:instructions'))
  )
}

async function gateManage(request: NextRequest) {
  return (
    (await verifyCmsToken(request, 'algorithm:manage')) ||
    (await verifyCmsToken(request, 'ai:configure')) ||
    (await verifyCmsToken(request, 'ai:instructions'))
  )
}

export async function GET(request: NextRequest) {
  const auth = await gateView(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const kind = (request.nextUrl.searchParams.get('kind') || 'algorithm_weight') as RuleProposal['kind']
  const [config, proposals] = await Promise.all([
    getActiveAlgorithmConfig(),
    listRuleProposals(kind),
  ])
  return NextResponse.json({ config, proposals })
}

export async function POST(request: NextRequest) {
  const auth = await gateManage(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    action?: string
    kind?: RuleProposal['kind']
    title?: string
    summary?: string
    evidence?: Record<string, unknown>
  }

  if (body.action === 'seed' && (body.kind === 'editorial_rule' || !body.kind)) {
    const result = await seedLearningProposals(null)
    return NextResponse.json({ ok: true, ...result })
  }

  if (!body.title || !body.summary || !body.kind) {
    return NextResponse.json({ error: 'kind, title, summary required' }, { status: 400 })
  }
  const proposal = await createRuleProposal({
    kind: body.kind,
    title: body.title,
    summary: body.summary,
    evidence: body.evidence,
  })
  return NextResponse.json({ proposal })
}

export async function PATCH(request: NextRequest) {
  const auth = await gateManage(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    kind?: RuleProposal['kind']
    id?: string
    status?: 'APPROVED' | 'REJECTED' | 'TESTING' | 'DEPLOYED'
  }
  if (!body.id || !body.kind || !body.status) {
    return NextResponse.json({ error: 'id, kind, status required' }, { status: 400 })
  }
  try {
    const proposal = await reviewRuleProposal({
      kind: body.kind,
      id: body.id,
      status: body.status,
      reviewedByHumanId: auth.uid,
    })
    if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ proposal })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Review failed' },
      { status: 500 }
    )
  }
}
