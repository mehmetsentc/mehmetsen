import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  buildOrgTree,
  listNewsroomAgentsFromDb,
  seedCitySmmAgents,
  seedCoreOrgAgents,
  syncLocalEditorsFromAiEditors,
} from '@/services/newsroomOs/agentService'
import { seedDefaultInstructionSets } from '@/services/newsroomOs/instructionService'
import { DEPARTMENT_LABELS, ROLE_TEMPLATE_LABELS } from '@/services/newsroomOs/orgSeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const agents = await listNewsroomAgentsFromDb()
    const tree = buildOrgTree(agents)
    return NextResponse.json({
      agents,
      tree: tree.map((n) => ({
        id: n.agent.id,
        displayName: n.agent.displayName,
        roleTemplateId: n.agent.roleTemplateId,
        roleLabel: ROLE_TEMPLATE_LABELS[n.agent.roleTemplateId],
        departmentId: n.agent.departmentId,
        departmentLabel: DEPARTMENT_LABELS[n.agent.departmentId],
        status: n.agent.status,
        managerAgentId: n.agent.managerAgentId,
        depth: n.depth,
        children: n.children,
        territories: n.agent.territories,
        autonomyLevel: n.agent.autonomyLevel,
        legacyAiEditorId: n.agent.legacyAiEditorId ?? null,
      })),
      counts: {
        total: agents.length,
        active: agents.filter((a) => a.status === 'active').length,
        smm: agents.filter((a) => a.roleTemplateId === 'city-smm').length,
        local: agents.filter((a) => a.roleTemplateId === 'local-editor').length,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Agents load failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth =
    (await verifyCmsToken(request, 'agents:manage')) ||
    (await verifyCmsToken(request, 'ai:configure'))
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    const action = body.action ?? 'seed-core'

    if (action === 'seed-core') {
      const result = await seedCoreOrgAgents()
      return NextResponse.json({ ok: true, action, ...result })
    }
    if (action === 'seed-smm-81') {
      const smm = await seedCitySmmAgents()
      const instructions = await seedDefaultInstructionSets(auth.uid)
      return NextResponse.json({ ok: true, action, smm, instructions })
    }
    if (action === 'sync-local-editors') {
      const result = await syncLocalEditorsFromAiEditors()
      return NextResponse.json({ ok: true, action, ...result })
    }
    if (action === 'seed-instructions') {
      const result = await seedDefaultInstructionSets(auth.uid)
      return NextResponse.json({ ok: true, action, ...result })
    }
    if (action === 'seed-all') {
      const core = await seedCoreOrgAgents()
      const smm = await seedCitySmmAgents()
      const locals = await syncLocalEditorsFromAiEditors()
      const instructions = await seedDefaultInstructionSets(auth.uid)
      return NextResponse.json({
        ok: true,
        action,
        core,
        smm,
        locals,
        instructions,
        created: [
          ...core.created,
          ...smm.created,
          ...locals.created,
          ...instructions.created,
        ],
        updated: [
          ...core.updated,
          ...smm.updated,
          ...locals.updated,
          ...instructions.updated,
        ],
      })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Seed failed' },
      { status: 500 }
    )
  }
}
