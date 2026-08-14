/**
 * Newsroom OS agent service — Firestore backed.
 * Runtime context is always built server-side.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { TURKISH_PROVINCES } from '@/constants/cities'
import type { AgentRuntimeContext, AgentTaskType, NewsroomAgent } from '@/types/newsroomOs'
import {
  DEPARTMENT_LABELS,
  ORG_SEED_SPECS,
  ROLE_TEMPLATE_LABELS,
  specToAgent,
} from '@/services/newsroomOs/orgSeed'
import { listAiEditors } from '@/lib/ai/editorial/aiEditorService'
import { buildEffectiveInstructions } from '@/services/newsroomOs/instructionService'
import {
  buildCitySmmAgentCustomInstructions,
  citySmmAgentId,
} from '@/services/newsroomOs/smmPlaybook'

const DEFAULT_ALLOWED_TASKS: Record<string, AgentTaskType[]> = {
  'editor-in-chief': ['EDITORIAL_APPROVAL', 'PUBLISH', 'LEARNING_ANALYSIS'],
  'deputy-editor': ['EDITORIAL_APPROVAL', 'PUBLISH'],
  'news-director': ['NEWS_VALUE', 'CATEGORY_EDIT', 'EDITORIAL_APPROVAL'],
  'desk-editor': ['AI_RESEARCH', 'AI_WRITE', 'CATEGORY_EDIT', 'NEWS_DETECTION'],
  'local-editor': ['AI_RESEARCH', 'AI_WRITE', 'CATEGORY_EDIT'],
  'fact-checker': ['FACT_CHECK'],
  'quality-controller': ['QUALITY_CHECK'],
  'legal-risk': ['LEGAL_RISK'],
  'seo-editor': ['SEO'],
  'visual-editor': ['VISUAL'],
  'social-director': ['SOCIAL_GENERATE', 'SOCIAL_PUBLISH'],
  'city-smm': ['SOCIAL_GENERATE', 'SOCIAL_PUBLISH'],
  'algorithm-analyst': ['ALGORITHM_ANALYSIS'],
  'learning-analyst': ['LEARNING_ANALYSIS'],
  publisher: ['PUBLISH', 'SOCIAL_PUBLISH'],
  reporter: ['AI_RESEARCH', 'AI_WRITE'],
  writer: ['AI_WRITE'],
}

function agentsCol() {
  return getAdminFirestore().collection(Collections.NEWSROOM_AGENTS)
}

export async function getNewsroomAgent(id: string): Promise<NewsroomAgent | null> {
  const snap = await agentsCol().doc(id).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as Omit<NewsroomAgent, 'id'>) }
}

export async function listNewsroomAgentsFromDb(opts?: {
  status?: NewsroomAgent['status']
  limit?: number
}): Promise<NewsroomAgent[]> {
  const snap = await agentsCol().limit(500).get()
  let agents = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NewsroomAgent, 'id'>) }))
  if (opts?.status) agents = agents.filter((a) => a.status === opts.status)
  agents.sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr'))
  return agents.slice(0, opts?.limit ?? 400)
}

/** Rebuild subordinateAgentIds from managerAgentId edges. */
export async function recomputeSubordinates(all?: NewsroomAgent[]): Promise<void> {
  const agents = all ?? (await listNewsroomAgentsFromDb())
  const byManager = new Map<string, string[]>()
  for (const a of agents) {
    if (!a.managerAgentId) continue
    const list = byManager.get(a.managerAgentId) ?? []
    list.push(a.id)
    byManager.set(a.managerAgentId, list)
  }
  const batch = getAdminFirestore().batch()
  let ops = 0
  for (const a of agents) {
    const next = (byManager.get(a.id) ?? []).sort()
    const prev = [...(a.subordinateAgentIds ?? [])].sort()
    if (JSON.stringify(next) === JSON.stringify(prev)) continue
    batch.update(agentsCol().doc(a.id), {
      subordinateAgentIds: next,
      updatedAt: Date.now(),
    })
    ops++
  }
  if (ops > 0) await batch.commit()
}

export async function seedCoreOrgAgents(): Promise<{
  created: string[]
  updated: string[]
  skipped: string[]
}> {
  const created: string[] = []
  const updated: string[] = []
  const skipped: string[] = []
  const now = Date.now()
  const db = getAdminFirestore()

  for (const spec of ORG_SEED_SPECS) {
    const ref = agentsCol().doc(spec.id)
    const existing = await ref.get()
    const agent = specToAgent(spec, now)
    if (!existing.exists) {
      await ref.set(agent)
      created.push(spec.id)
    } else {
      await ref.set(
        {
          ...agent,
          createdAt: (existing.data() as NewsroomAgent).createdAt ?? now,
          customInstructions:
            (existing.data() as NewsroomAgent).customInstructions ||
            agent.customInstructions,
          status: (existing.data() as NewsroomAgent).status ?? 'active',
          updatedAt: now,
        },
        { merge: true }
      )
      updated.push(spec.id)
    }
  }

  await recomputeSubordinates()

  // Wire communication allow-lists after subordinates are known
  const all = await listNewsroomAgentsFromDb()
  const batch = db.batch()
  for (const a of all) {
    const peers = all
      .filter((x) => x.managerAgentId && x.managerAgentId === a.managerAgentId && x.id !== a.id)
      .map((x) => x.id)
    const allowed = Array.from(
      new Set([
        ...(a.managerAgentId ? [a.managerAgentId] : []),
        ...peers,
        ...(a.subordinateAgentIds ?? []),
      ])
    )
    batch.update(agentsCol().doc(a.id), { allowedAgentIds: allowed, updatedAt: Date.now() })
  }
  await batch.commit()

  if (created.length === 0 && updated.length === 0) skipped.push('noop')
  return { created, updated, skipped }
}

/** Create city-smm agents for all 81 provinces under Social Media Director. */
export async function seedCitySmmAgents(): Promise<{ created: string[]; updated: string[] }> {
  const created: string[] = []
  const updated: string[] = []
  const now = Date.now()
  const directorId = 'agent-social-director'

  // Ensure director exists
  if (!(await getNewsroomAgent(directorId))) {
    await seedCoreOrgAgents()
  }

  for (const province of TURKISH_PROVINCES) {
    const id = citySmmAgentId(province.slug)
    const ref = agentsCol().doc(id)
    const agent: NewsroomAgent = {
      id,
      name: `smm-${province.slug}`,
      displayName: `${province.name} SMM AI`,
      description: `${province.name} ili sosyal medya ajanı — generate/publish/analytics`,
      roleTemplateId: 'city-smm',
      departmentId: 'social',
      managerAgentId: directorId,
      managerHumanId: null,
      subordinateAgentIds: [],
      status: 'active',
      autonomyLevel: 2,
      permissions: ['ai:use', 'news:read', 'social:view', 'social:publish'],
      allowedAgentIds: [directorId],
      territories: [province.slug],
      categories: ['yerel-haber', 'yerel-duyuru'],
      languages: ['tr'],
      modelConfig: {
        primaryProvider: 'deepseek',
        primaryModel: process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash',
        temperature: 0.5,
        maxTokens: 2048,
        memoryEnabled: true,
        retryCount: 2,
        timeoutMs: 45_000,
      },
      tools: ['social-generate', 'social-publish', 'analytics-read'],
      customInstructions: buildCitySmmAgentCustomInstructions(province),
      legacyAiEditorId: null,
      createdAt: now,
      updatedAt: now,
    }
    const snap = await ref.get()
    if (!snap.exists) {
      await ref.set(agent)
      created.push(id)
    } else {
      const prev = snap.data() as NewsroomAgent
      await ref.set(
        {
          ...agent,
          createdAt: prev.createdAt ?? now,
          // Seed refresh always reapplies playbook agent instructions
          customInstructions: agent.customInstructions,
        },
        { merge: true }
      )
      updated.push(id)
    }
  }

  await recomputeSubordinates()
  return { created, updated }
}

/** Link existing city aiEditors as local-editor agents under Yerel Yayın Müdürü. */
export async function syncLocalEditorsFromAiEditors(): Promise<{
  created: string[]
  updated: string[]
}> {
  const created: string[] = []
  const updated: string[] = []
  const now = Date.now()
  const managerId = 'agent-desk-local'
  if (!(await getNewsroomAgent(managerId))) {
    await seedCoreOrgAgents()
  }

  const editors = await listAiEditors({ status: 'active', limit: 300 })
  const locals = editors.filter((e) => e.personaType === 'local_editor' && e.citySlug)

  for (const editor of locals) {
    const slug = String(editor.citySlug)
    const id = `agent-local-${slug}`
    const ref = agentsCol().doc(id)
    const agent: NewsroomAgent = {
      id,
      name: `local-${slug}`,
      displayName: editor.name || `${slug} Yerel Editör AI`,
      description: editor.shortBio || editor.title || 'Yerel AI editör',
      roleTemplateId: 'local-editor',
      departmentId: 'desk-local',
      managerAgentId: managerId,
      managerHumanId: null,
      subordinateAgentIds: [],
      status: editor.status === 'active' ? 'active' : 'paused',
      autonomyLevel: 2,
      permissions: ['ai:use', 'news:read', 'news:create', 'news:edit'],
      allowedAgentIds: [managerId, 'agent-fact-check', 'agent-seo'],
      territories: [slug],
      categories: editor.managedCategories?.length
        ? editor.managedCategories
        : editor.categoryIds ?? ['yerel-haber'],
      languages: ['tr'],
      modelConfig: {
        primaryProvider: 'deepseek',
        primaryModel: process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash',
        temperature: typeof editor.temperature === 'number' ? editor.temperature : 0.4,
        maxTokens: 4096,
        memoryEnabled: true,
        factCheckRequired: true,
        retryCount: 2,
        timeoutMs: 60_000,
      },
      tools: ['write', 'research', 'escalate'],
      legacyAiEditorId: editor.id,
      customInstructions: editor.editorialMission || undefined,
      createdAt: now,
      updatedAt: now,
    }
    const snap = await ref.get()
    if (!snap.exists) {
      await ref.set(agent)
      created.push(id)
    } else {
      await ref.set(
        {
          ...agent,
          createdAt: (snap.data() as NewsroomAgent).createdAt ?? now,
        },
        { merge: true }
      )
      updated.push(id)
    }
  }

  await recomputeSubordinates()
  return { created, updated }
}

/**
 * Build trusted runtime context for an agent.
 * NEVER accept this object from the client.
 */
export async function buildAgentRuntimeContext(agentId: string): Promise<AgentRuntimeContext | null> {
  const agent = await getNewsroomAgent(agentId)
  if (!agent) return null
  const all = await listNewsroomAgentsFromDb()
  const manager = agent.managerAgentId
    ? all.find((a) => a.id === agent.managerAgentId) ?? null
    : null
  const subordinates = all
    .filter((a) => a.managerAgentId === agent.id)
    .map((a) => ({
      id: a.id,
      displayName: a.displayName,
      roleTemplateId: a.roleTemplateId,
      status: a.status,
    }))

  const allowed = agent.allowedAgentIds?.length
    ? agent.allowedAgentIds
    : [
        ...(agent.managerAgentId ? [agent.managerAgentId] : []),
        ...subordinates.map((s) => s.id),
      ]

  const allowedTaskTypes = DEFAULT_ALLOWED_TASKS[agent.roleTemplateId] ?? ['AI_WRITE']
  const allTaskTypes = Object.values(DEFAULT_ALLOWED_TASKS).flat()
  const deniedTaskTypes = Array.from(new Set(allTaskTypes)).filter(
    (t) => !allowedTaskTypes.includes(t)
  )

  const escalationRules = [
    'HIGH/CRITICAL legal risk → manager + human',
    'Fact-check CONFLICTING/FALSE → manager',
    'Cost limit aşımı → pause + manager',
    'Social publish failure (3x) → social-director',
  ]

  const effective = await buildEffectiveInstructions(agent)

  return {
    agent,
    roleLabel: ROLE_TEMPLATE_LABELS[agent.roleTemplateId],
    departmentLabel: DEPARTMENT_LABELS[agent.departmentId],
    manager: manager
      ? {
          id: manager.id,
          displayName: manager.displayName,
          roleTemplateId: manager.roleTemplateId,
        }
      : null,
    subordinates,
    canCommunicateWith: allowed,
    allowedTaskTypes,
    deniedTaskTypes,
    escalationRules,
    reportResultToAgentId: agent.managerAgentId ?? null,
    effectiveInstructionVersionIds: effective.versionIds,
    effectiveInstructions: {
      layers: effective.layers,
      combinedText: effective.combinedText,
    },
  }
}

export function buildOrgTree(agents: NewsroomAgent[]): Array<{
  agent: NewsroomAgent
  depth: number
  children: string[]
}> {
  const roots = agents.filter((a) => !a.managerAgentId || !agents.some((x) => x.id === a.managerAgentId))
  const result: Array<{ agent: NewsroomAgent; depth: number; children: string[] }> = []

  function walk(id: string, depth: number, seen: Set<string>) {
    if (seen.has(id)) return
    seen.add(id)
    const agent = agents.find((a) => a.id === id)
    if (!agent) return
    const children = agents.filter((a) => a.managerAgentId === id).map((a) => a.id)
    result.push({ agent, depth, children })
    for (const childId of children) walk(childId, depth + 1, seen)
  }

  const seen = new Set<string>()
  for (const r of roots) walk(r.id, 0, seen)
  // orphans
  for (const a of agents) {
    if (!seen.has(a.id)) walk(a.id, 0, seen)
  }
  return result
}
