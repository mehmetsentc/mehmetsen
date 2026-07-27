import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  archiveAiEditor,
  getAiEditorById,
  getActivePrompt,
  setPromptVersion,
  updateAiEditor,
} from '@/lib/ai/editorial/aiEditorService'
import { invalidateEditorRouterCache } from '@/lib/ai/editorial/editorRouter'
import { buildEditorPrompt } from '@/lib/ai/editorial/promptBuilder'
import { resolveModelForEditor } from '@/lib/ai/editorial/modelRouter'
import type { AiPromptType } from '@/types/aiEditor'
import { callDeepSeek } from '@/lib/ai/editorial/sandboxCall'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, ctx: Ctx) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const editor = await getAiEditorById(id)
  if (!editor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const promptTypes: AiPromptType[] = [
    'core',
    'news',
    'column',
    'analysis',
    'video',
    'seo',
    'review',
    'source',
    'breaking',
  ]
  const prompts: Record<string, Awaited<ReturnType<typeof getActivePrompt>>> = {}
  for (const t of promptTypes) {
    prompts[t] = await getActivePrompt(id, t)
  }

  return NextResponse.json({ success: true, editor, prompts })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth =
    (await verifyCmsToken(request, 'editors:manage')) ||
    (await verifyCmsToken(request, 'ai:configure'))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  if (body.action === 'archive') {
    const editor = await archiveAiEditor(id)
    invalidateEditorRouterCache()
    return NextResponse.json({ success: true, editor })
  }

  if (body.action === 'setPrompt') {
    const promptType = String(body.promptType || '') as AiPromptType
    const content = String(body.content || '')
    if (!promptType || !content.trim()) {
      return NextResponse.json({ error: 'promptType and content required' }, { status: 400 })
    }
    const prompt = await setPromptVersion({
      editorId: id,
      promptType,
      content,
      changedBy: auth.uid,
      changeReason: body.changeReason ? String(body.changeReason) : null,
    })
    return NextResponse.json({ success: true, prompt })
  }

  if (body.action === 'sandbox') {
    const editor = await getAiEditorById(id)
    if (!editor) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const task = (String(body.task || 'news') === 'column' ? 'column' : 'news') as 'news' | 'column'
    const built = await buildEditorPrompt({
      editor,
      task,
      sourceTitle: String(body.sourceTitle || 'Örnek başlık'),
      sourceBody: String(body.sourceBody || ''),
      sourceUrl: body.sourceUrl ? String(body.sourceUrl) : undefined,
    })
    const resolved = resolveModelForEditor(editor, task)
    const started = Date.now()
    const result = await callDeepSeek({
      system: built.system,
      user: built.user,
      model: resolved.model,
    })
    return NextResponse.json({
      success: true,
      sandbox: true,
      provider: resolved.provider,
      model: resolved.model,
      promptVersions: built.promptVersions,
      durationMs: Date.now() - started,
      result,
    })
  }

  try {
    const editor = await updateAiEditor(id, body as never, auth.uid)
    invalidateEditorRouterCache()
    return NextResponse.json({ success: true, editor })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
