import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  createAiEditor,
  listAiEditors,
  seedDefaultAiEditors,
  refreshStylePromptsFromSeed,
} from '@/lib/ai/editorial/aiEditorService'
import { invalidateEditorRouterCache } from '@/lib/ai/editorial/editorRouter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const status = url.searchParams.get('status') as 'active' | 'disabled' | 'archived' | null
  const editors = await listAiEditors({
    status: status || undefined,
    limit: 100,
  })
  return NextResponse.json({ success: true, editors })
}

export async function POST(request: Request) {
  const auth =
    (await verifyCmsToken(request, 'editors:manage')) ||
    (await verifyCmsToken(request, 'ai:configure'))
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (body.action === 'seed') {
    const result = await seedDefaultAiEditors(auth.uid)
    invalidateEditorRouterCache()
    return NextResponse.json({ success: true, ...result })
  }
  if (body.action === 'refreshStylePrompts') {
    const result = await refreshStylePromptsFromSeed(auth.uid)
    invalidateEditorRouterCache()
    return NextResponse.json({ success: true, ...result })
  }

  const name = String(body.name ?? '').trim()
  const title = String(body.title ?? '').trim()
  if (!name || !title) {
    return NextResponse.json({ error: 'name and title required' }, { status: 400 })
  }

  try {
    const editor = await createAiEditor({
      name,
      slug: body.slug ? String(body.slug) : undefined,
      title,
      shortBio: body.shortBio ? String(body.shortBio) : undefined,
      bio: body.bio ? String(body.bio) : undefined,
      avatarUrl: (body.avatarUrl as string | null | undefined) ?? null,
      coverUrl: (body.coverUrl as string | null | undefined) ?? null,
      columnName: (body.columnName as string | null | undefined) ?? null,
      primarySpecialization: body.primarySpecialization
        ? String(body.primarySpecialization)
        : undefined,
      specializations: Array.isArray(body.specializations)
        ? body.specializations.map(String)
        : undefined,
      categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds.map(String) : undefined,
      capabilities: (body.capabilities as object | undefined) as never,
      publishPolicy: (body.publishPolicy as 'REQUIRES_APPROVAL' | undefined) ?? 'REQUIRES_APPROVAL',
      prompts: (body.prompts as object | undefined) as never,
      createdBy: auth.uid,
    })
    invalidateEditorRouterCache()
    return NextResponse.json({ success: true, editor })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
