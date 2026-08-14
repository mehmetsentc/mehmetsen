import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  buildEffectiveInstructions,
  getInstructionSet,
  listInstructionSets,
  listInstructionVersions,
  seedDefaultInstructionSets,
  upsertInstructionSetVersion,
} from '@/services/newsroomOs/instructionService'
import { getNewsroomAgent } from '@/services/newsroomOs/agentService'
import type { InstructionLayer } from '@/types/newsroomOs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'ai:instructions')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const agentId = request.nextUrl.searchParams.get('agentId')
  const setId = request.nextUrl.searchParams.get('setId')
  const versions = request.nextUrl.searchParams.get('versions') === '1'

  try {
    if (agentId) {
      const agent = await getNewsroomAgent(agentId)
      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      const effective = await buildEffectiveInstructions(agent)
      return NextResponse.json({ agentId, effective })
    }
    if (setId && versions) {
      return NextResponse.json({ versions: await listInstructionVersions(setId) })
    }
    if (setId) {
      const set = await getInstructionSet(setId)
      if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ set })
    }
    const sets = await listInstructionSets()
    return NextResponse.json({
      sets,
      layers: ['global', 'department', 'role', 'location', 'agent', 'task', 'news'],
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth =
    (await verifyCmsToken(request, 'ai:instructions')) ||
    (await verifyCmsToken(request, 'ai:configure'))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    action?: string
    layer?: InstructionLayer
    scopeKey?: string
    title?: string
    content?: string
    changelog?: string
  }

  try {
    if (body.action === 'seed') {
      const result = await seedDefaultInstructionSets(auth.uid)
      return NextResponse.json({ ok: true, ...result })
    }
    if (!body.layer || !body.scopeKey || !body.title || !body.content) {
      return NextResponse.json({ error: 'layer, scopeKey, title, content required' }, { status: 400 })
    }
    const result = await upsertInstructionSetVersion({
      layer: body.layer,
      scopeKey: body.scopeKey,
      title: body.title,
      content: body.content,
      changelog: body.changelog,
      createdByHumanId: auth.uid,
      activate: true,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
