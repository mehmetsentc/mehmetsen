import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { debugSeoUrl } from '@/services/seo/seoDebugService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Admin SEO debug — system:settings only. */
export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url).searchParams.get('url')?.trim()
  if (!url) return NextResponse.json({ error: 'url query param required' }, { status: 400 })

  const result = await debugSeoUrl(url)
  return NextResponse.json(result)
}
