/**
 * Central agent task bus — agents do not free-chat; they create tasks.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { AgentTask, AgentTaskStatus, AgentTaskType } from '@/types/newsroomOs'
import { buildAgentRuntimeContext, getNewsroomAgent } from '@/services/newsroomOs/agentService'

function tasksCol() {
  return getAdminFirestore().collection(Collections.AGENT_TASKS)
}

function auditCol() {
  return getAdminFirestore().collection(Collections.CMS_AUDIT_LOGS)
}

export async function createAgentTask(input: {
  type: AgentTaskType
  newsId?: string | null
  createdByAgentId?: string | null
  createdByHumanId?: string | null
  assignedAgentId?: string | null
  assignedHumanId?: string | null
  priority?: AgentTask['priority']
  input?: Record<string, unknown>
  parentTaskId?: string | null
}): Promise<AgentTask> {
  if (input.assignedAgentId) {
    const assignee = await getNewsroomAgent(input.assignedAgentId)
    if (assignee) {
      const assigneeCtx = await buildAgentRuntimeContext(assignee.id)
      if (assigneeCtx && !assigneeCtx.allowedTaskTypes.includes(input.type)) {
        throw new Error(`Assignee ${assignee.id} cannot perform task type ${input.type}`)
      }
    }
  }

  if (input.createdByAgentId && input.assignedAgentId && !input.createdByHumanId) {
    const ctx = await buildAgentRuntimeContext(input.createdByAgentId)
    if (ctx && !ctx.canCommunicateWith.includes(input.assignedAgentId)) {
      throw new Error(
        `Agent ${input.createdByAgentId} cannot assign tasks to ${input.assignedAgentId}`
      )
    }
  }

  const now = Date.now()
  const ref = tasksCol().doc()
  const task: AgentTask = {
    id: ref.id,
    type: input.type,
    newsId: input.newsId ?? null,
    createdByAgentId: input.createdByAgentId ?? null,
    createdByHumanId: input.createdByHumanId ?? null,
    assignedAgentId: input.assignedAgentId ?? null,
    assignedHumanId: input.assignedHumanId ?? null,
    priority: input.priority ?? 'normal',
    status: 'PENDING',
    input: input.input ?? {},
    output: undefined,
    evidence: [],
    confidence: null,
    parentTaskId: input.parentTaskId ?? null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await ref.set(task)

  await auditCol().add({
    actorType: input.createdByHumanId ? 'HUMAN' : input.createdByAgentId ? 'AI' : 'SYSTEM',
    actorId: input.createdByHumanId || input.createdByAgentId || 'system',
    actorLabel: input.createdByHumanId || input.createdByAgentId || 'system',
    action: 'agent_task.create',
    entityType: 'agentTask',
    entityId: task.id,
    newsId: task.newsId,
    agentTaskId: task.id,
    after: { type: task.type, assignedAgentId: task.assignedAgentId, status: task.status },
    createdAt: now,
  })

  return task
}

export async function updateAgentTaskStatus(
  taskId: string,
  patch: {
    status: AgentTaskStatus
    output?: Record<string, unknown>
    evidence?: unknown[]
    confidence?: number | null
    errorMessage?: string | null
    actorType?: 'HUMAN' | 'AI' | 'SYSTEM'
    actorId?: string
  }
): Promise<AgentTask | null> {
  const ref = tasksCol().doc(taskId)
  const snap = await ref.get()
  if (!snap.exists) return null
  const prev = { id: snap.id, ...(snap.data() as Omit<AgentTask, 'id'>) }
  const now = Date.now()
  const next: Partial<AgentTask> = {
    status: patch.status,
    updatedAt: now,
  }
  if (patch.output !== undefined) next.output = patch.output
  if (patch.evidence !== undefined) next.evidence = patch.evidence
  if (patch.confidence !== undefined) next.confidence = patch.confidence
  if (patch.errorMessage !== undefined) next.errorMessage = patch.errorMessage
  if (patch.status === 'PROCESSING' && !prev.startedAt) next.startedAt = now
  if (patch.status === 'COMPLETED' || patch.status === 'FAILED' || patch.status === 'NEEDS_HUMAN') {
    next.completedAt = now
  }
  await ref.update(next)

  await auditCol().add({
    actorType: patch.actorType ?? 'SYSTEM',
    actorId: patch.actorId ?? 'system',
    actorLabel: patch.actorId ?? 'system',
    action: 'agent_task.status',
    entityType: 'agentTask',
    entityId: taskId,
    newsId: prev.newsId,
    agentTaskId: taskId,
    before: { status: prev.status },
    after: { status: patch.status },
    createdAt: now,
  })

  return { ...prev, ...next, id: taskId }
}

export async function listAgentTasks(opts?: {
  status?: AgentTaskStatus
  assignedAgentId?: string
  newsId?: string
  limit?: number
}): Promise<AgentTask[]> {
  // Sort in memory to avoid requiring a composite index on day one.
  const snap = await tasksCol().limit(Math.min(opts?.limit ?? 100, 200)).get()
  let tasks = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AgentTask, 'id'>) }))
  if (opts?.status) tasks = tasks.filter((t) => t.status === opts.status)
  if (opts?.assignedAgentId) tasks = tasks.filter((t) => t.assignedAgentId === opts.assignedAgentId)
  if (opts?.newsId) tasks = tasks.filter((t) => t.newsId === opts.newsId)
  tasks.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  return tasks.slice(0, opts?.limit ?? 100)
}

/** Convenience: desk editor asks fact-check agent to verify a claim set. */
export async function requestFactCheckTask(params: {
  newsId: string
  createdByAgentId: string
  claims: string[]
  createdByHumanId?: string
}): Promise<AgentTask> {
  return createAgentTask({
    type: 'FACT_CHECK',
    newsId: params.newsId,
    createdByAgentId: params.createdByAgentId,
    createdByHumanId: params.createdByHumanId,
    assignedAgentId: 'agent-fact-check',
    priority: 'high',
    input: { claims: params.claims },
  })
}

/**
 * Fire-and-forget overlay for the existing newsroom pipeline.
 * Never throws to callers — task bus must not break publish.
 */
export async function recordPipelineStageTask(params: {
  type: AgentTaskType
  newsId?: string | null
  assignedAgentId: string
  status?: AgentTaskStatus
  priority?: AgentTask['priority']
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  confidence?: number | null
}): Promise<AgentTask | null> {
  try {
    const task = await createAgentTask({
      type: params.type,
      newsId: params.newsId,
      assignedAgentId: params.assignedAgentId,
      priority: params.priority ?? 'normal',
      input: params.input,
    })
    const status = params.status ?? 'COMPLETED'
    if (status !== 'PENDING') {
      return updateAgentTaskStatus(task.id, {
        status,
        output: params.output,
        confidence: params.confidence ?? null,
        actorType: 'SYSTEM',
        actorId: 'newsroom-pipeline',
      })
    }
    return task
  } catch (err) {
    console.warn('[newsroomOs] recordPipelineStageTask skipped:', err)
    return null
  }
}
