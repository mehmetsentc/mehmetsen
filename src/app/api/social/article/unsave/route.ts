import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
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
    await socialGraphRepository.unsaveArticle(auth.uid, articleId)
    return NextResponse.json({ saved: false })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unsave failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
