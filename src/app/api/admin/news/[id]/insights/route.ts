import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getArticleInsights } from '@/services/feed/articleInsights.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth =
    (await verifyCmsToken(request, 'news:edit')) ||
    (await verifyCmsToken(request, 'analytics:read'))
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const key = typeof id === 'string' ? id.trim() : ''
  if (!key || key.length > 128) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  try {
    const data = await getArticleInsights(key)
    if (!data) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('[admin/news/insights]', error)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
