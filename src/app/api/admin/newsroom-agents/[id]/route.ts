import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  buildAgentRuntimeContext,
  getNewsroomAgent,
} from '@/services/newsroomOs/agentService'
import { DEPARTMENT_LABELS, ROLE_TEMPLATE_LABELS } from '@/services/newsroomOs/orgSeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  try {
    const agent = await getNewsroomAgent(id)
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    const runtime = await buildAgentRuntimeContext(id)
    return NextResponse.json({
      agent: {
        ...agent,
        roleLabel: ROLE_TEMPLATE_LABELS[agent.roleTemplateId],
        departmentLabel: DEPARTMENT_LABELS[agent.departmentId],
      },
      runtime,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Load failed' },
      { status: 500 }
    )
  }
}
