import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEnabled } from '@/lib/social/featureFlag'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isSocialGraphEnabled()) {
    return NextResponse.json({ error: 'Social graph disabled' }, { status: 404 })
  }
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : ''
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  try {
    await socialGraphRepository.unlikeArticle(auth.uid, articleId)
    const counts = await socialGraphRepository.getArticleCounts(articleId)
    return NextResponse.json({ liked: false, ...counts })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unlike failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
