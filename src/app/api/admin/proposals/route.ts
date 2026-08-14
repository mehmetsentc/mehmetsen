import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  createRuleProposal,
  getActiveAlgorithmConfig,
  listRuleProposals,
  reviewRuleProposal,
} from '@/services/newsroomOs/proposalService'
import type { RuleProposal } from '@/types/newsroomOs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'algorithm:view')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const kind = (request.nextUrl.searchParams.get('kind') || 'algorithm_weight') as RuleProposal['kind']
  const [config, proposals] = await Promise.all([
    getActiveAlgorithmConfig(),
    listRuleProposals(kind),
  ])
  return NextResponse.json({ config, proposals })
}

export async function POST(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'algorithm:manage')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    kind?: RuleProposal['kind']
    title?: string
    summary?: string
    evidence?: Record<string, unknown>
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
  const auth = await verifyCmsToken(request, 'algorithm:manage')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    kind?: RuleProposal['kind']
    id?: string
    status?: 'APPROVED' | 'REJECTED' | 'TESTING' | 'DEPLOYED'
  }
  if (!body.id || !body.kind || !body.status) {
    return NextResponse.json({ error: 'id, kind, status required' }, { status: 400 })
  }
  const proposal = await reviewRuleProposal({
    kind: body.kind,
    id: body.id,
    status: body.status,
    reviewedByHumanId: auth.uid,
  })
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ proposal })
}
