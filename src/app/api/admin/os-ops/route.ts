import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { listAuditLogs, probeSystemHealth, getAiModelRegistry } from '@/services/newsroomOs/opsService'
import { createMemory, listMemories } from '@/services/newsroomOs/memoryService'
import { enqueueSmmItem, listSmmQueue } from '@/services/newsroomOs/smmQueueService'
import { listAgentTasks } from '@/services/newsroomOs/taskService'
import { CMS_ROLE_LABELS, ROLE_PERMISSIONS, type CmsRole } from '@/types/cms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resource = request.nextUrl.searchParams.get('resource') || 'health'

  try {
    if (resource === 'health') {
      const gate = await verifyCmsToken(request, 'system:settings')
      if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      return NextResponse.json(await probeSystemHealth())
    }
    if (resource === 'audit') {
      const gate = await verifyCmsToken(request, 'logs:view')
      if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const logs = await listAuditLogs(100)
      return NextResponse.json({ logs })
    }
    if (resource === 'memory') {
      const gate = await verifyCmsToken(request, 'ai:configure')
      if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const memories = await listMemories({
        scope: (request.nextUrl.searchParams.get('scope') as 'agent' | 'shared' | null) || undefined,
        limit: 80,
      })
      return NextResponse.json({ memories })
    }
    if (resource === 'models') {
      const gate = await verifyCmsToken(request, 'ai:models')
      if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      return NextResponse.json({ models: getAiModelRegistry() })
    }
    if (resource === 'smm-queue') {
      const gate = await verifyCmsToken(request, 'social:view')
      if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const items = await listSmmQueue(100)
      return NextResponse.json({
        items,
        counts: {
          queued: items.filter((i) => i.status === 'queued').length,
          failed: items.filter((i) => i.status === 'failed' || i.status === 'dead').length,
          published: items.filter((i) => i.status === 'published').length,
        },
      })
    }
    if (resource === 'ai-performance') {
      const gate = await verifyCmsToken(request, 'analytics:read')
      if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const tasks = await listAgentTasks({ limit: 200 })
      const completed = tasks.filter((t) => t.status === 'COMPLETED')
      const failed = tasks.filter((t) => t.status === 'FAILED')
      const needsHuman = tasks.filter((t) => t.status === 'NEEDS_HUMAN')
      const byType: Record<string, number> = {}
      for (const t of tasks) byType[t.type] = (byType[t.type] ?? 0) + 1
      return NextResponse.json({
        totals: {
          tasks: tasks.length,
          completed: completed.length,
          failed: failed.length,
          needsHuman: needsHuman.length,
          successRate:
            tasks.length === 0
              ? null
              : Math.round((completed.length / Math.max(1, completed.length + failed.length)) * 100),
        },
        byType,
        recent: tasks.slice(0, 20),
      })
    }
    if (resource === 'roles') {
      const gate = await verifyCmsToken(request, 'roles:manage')
      if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const roles = (Object.keys(ROLE_PERMISSIONS) as CmsRole[]).map((role) => ({
        role,
        label: CMS_ROLE_LABELS[role],
        permissions: ROLE_PERMISSIONS[role],
        count: ROLE_PERMISSIONS[role].length,
      }))
      return NextResponse.json({ roles })
    }
    if (resource === 'instructions') {
      const gate = await verifyCmsToken(request, 'ai:instructions')
      if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      // Effective instruction layers — read-only view of inheritance order
      return NextResponse.json({
        layers: [
          { id: 'global', label: 'GLOBAL EDITORIAL RULES', status: 'active' },
          { id: 'department', label: 'DEPARTMENT RULES', status: 'active' },
          { id: 'role', label: 'ROLE RULES', status: 'active' },
          { id: 'location', label: 'LOCATION RULES', status: 'ready' },
          { id: 'agent', label: 'AGENT CUSTOM INSTRUCTIONS', status: 'ready' },
          { id: 'task', label: 'TASK CONTEXT', status: 'runtime' },
          { id: 'news', label: 'NEWS CONTEXT', status: 'runtime' },
        ],
        note: 'Katmanlı birleşim agent runtime context içinde server-side üretilir. Prompt string client’a gönderilmez.',
        hrefEditors: '/admin/ai-editors',
        hrefAgents: '/admin/ai-agents',
      })
    }

    return NextResponse.json({ error: 'Unknown resource' }, { status: 400 })
  } catch (e) {
    console.error('[os-ops]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyCmsToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as {
    resource?: string
    content?: string
    scope?: 'agent' | 'shared'
    type?: string
    newsId?: string
    citySlug?: string
    platform?: string
  }

  if (body.resource === 'memory') {
    const gate = await verifyCmsToken(request, 'ai:configure')
    if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!body.content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })
    const memory = await createMemory({
      scope: body.scope === 'agent' ? 'agent' : 'shared',
      type: (body.type as 'editorialRule') || 'editorialRule',
      content: body.content,
      verified: true,
      verifiedBy: auth.uid,
      confidence: 0.85,
    })
    return NextResponse.json({ memory })
  }

  if (body.resource === 'smm-queue') {
    const gate = await verifyCmsToken(request, 'social:publish')
    if (!gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const item = await enqueueSmmItem({
      newsId: body.newsId,
      citySlug: body.citySlug,
      platform: body.platform || 'facebook',
      payload: { note: 'Manuel kuyruk kaydı — publish worker bağlanınca işlenir' },
    })
    return NextResponse.json({ item })
  }

  return NextResponse.json({ error: 'Unknown resource' }, { status: 400 })
}
