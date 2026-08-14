import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  createAgentTask,
  listAgentTasks,
  updateAgentTaskStatus,
} from '@/services/newsroomOs/taskService'
import type { AgentTaskStatus, AgentTaskType } from '@/types/newsroomOs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as AgentTaskStatus | null
    const assignedAgentId = searchParams.get('assignedAgentId') || undefined
    const newsId = searchParams.get('newsId') || undefined
    const tasks = await listAgentTasks({
      status: status || undefined,
      assignedAgentId,
      newsId,
      limit: 100,
    })
    return NextResponse.json({
      tasks,
      counts: {
        pending: tasks.filter((t) => t.status === 'PENDING').length,
        processing: tasks.filter((t) => t.status === 'PROCESSING').length,
        needsHuman: tasks.filter((t) => t.status === 'NEEDS_HUMAN').length,
        failed: tasks.filter((t) => t.status === 'FAILED').length,
        completed: tasks.filter((t) => t.status === 'COMPLETED').length,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'List failed' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth =
    (await verifyCmsToken(request, 'agents:delegate')) ||
    (await verifyCmsToken(request, 'agents:manage')) ||
    (await verifyCmsToken(request, 'ai:use'))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = (await request.json()) as {
      action?: 'create' | 'update-status'
      type?: AgentTaskType
      newsId?: string
      assignedAgentId?: string
      priority?: 'low' | 'normal' | 'high' | 'critical'
      input?: Record<string, unknown>
      taskId?: string
      status?: AgentTaskStatus
      output?: Record<string, unknown>
      errorMessage?: string
    }

    if (body.action === 'update-status') {
      if (!body.taskId || !body.status) {
        return NextResponse.json({ error: 'taskId and status required' }, { status: 400 })
      }
      const task = await updateAgentTaskStatus(body.taskId, {
        status: body.status,
        output: body.output,
        errorMessage: body.errorMessage ?? null,
        actorType: 'HUMAN',
        actorId: auth.uid,
      })
      if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ ok: true, task })
    }

    if (!body.type) {
      return NextResponse.json({ error: 'type required' }, { status: 400 })
    }

    const task = await createAgentTask({
      type: body.type,
      newsId: body.newsId,
      assignedAgentId: body.assignedAgentId,
      createdByHumanId: auth.uid,
      priority: body.priority,
      input: body.input,
    })
    return NextResponse.json({ ok: true, task })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Create failed' },
      { status: 500 }
    )
  }
}
