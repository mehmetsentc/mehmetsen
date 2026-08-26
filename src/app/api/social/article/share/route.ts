import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEnabled } from '@/lib/social/featureFlag'
import { verifyUserRequest } from '@/lib/userAuthServer'
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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : ''
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  const auth = await verifyUserRequest(request)

  try {
    await socialGraphRepository.recordShare(auth?.uid ?? null, articleId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Share failed'
    return NextResponse.json({ error: msg }, { status: msg === 'ARTICLE_NOT_FOUND' ? 404 : 500 })
  }
}
