import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { generateImageAnalysis } from '@/lib/ai/imageSeo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RequestBody {
  imageUrl?: string
  title?: string
  content?: string
  summary?: string
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const imageUrl = body.imageUrl?.trim()
  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl gerekli' }, { status: 400 })
  }

  try {
    const analysis = await generateImageAnalysis({
      imageUrl,
      title: body.title?.trim() ?? '',
      content: body.content?.trim(),
      summary: body.summary?.trim(),
    })
    if (!analysis) {
      return NextResponse.json({ error: 'AI görsel analizi üretilemedi' }, { status: 500 })
    }
    return NextResponse.json(analysis)
  } catch (error) {
    console.error('[ai-image-seo]', error)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
