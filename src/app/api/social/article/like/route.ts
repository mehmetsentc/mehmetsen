import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleLike(request: Request, like: boolean) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await isSocialGraphEffectiveForUser(auth.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Social graph disabled' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : ''
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  try {
    if (like) {
      await socialGraphRepository.likeArticle(auth.uid, articleId, auth.email)
    } else {
      await socialGraphRepository.unlikeArticle(auth.uid, articleId)
    }
    const counts = await socialGraphRepository.getArticleCounts(articleId)
    const liked = like ? true : false
    return NextResponse.json({ liked, ...counts })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Like failed'
    return NextResponse.json({ error: msg }, { status: msg === 'ARTICLE_NOT_FOUND' ? 404 : 500 })
  }
}

export async function POST(request: Request) {
  return handleLike(request, true)
}
