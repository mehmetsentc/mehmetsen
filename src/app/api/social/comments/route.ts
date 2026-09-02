import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await verifyUserRequest(request)
  const allowed = await isSocialGraphEffectiveForUser(auth?.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Social graph disabled' }, { status: 404 })
  }

  const url = new URL(request.url)
  const articleId = url.searchParams.get('articleId')?.trim() ?? ''
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  const cursor = url.searchParams.get('cursor')
  const result = await socialGraphRepository.listComments(articleId, 30, cursor)
  return NextResponse.json(result)
}

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
  const content = typeof body.content === 'string' ? body.content : ''
  const parentId = typeof body.parentId === 'string' ? body.parentId : null

  if (!articleId || !content.trim()) {
    return NextResponse.json({ error: 'articleId and content required' }, { status: 400 })
  }

  try {
    const created = await socialGraphRepository.createComment({
      userId: auth.uid,
      articleId,
      content,
      parentId,
      email: auth.email,
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Comment failed'
    console.info('[social.comments]', {
      stage: 'create',
      code: msg,
      articleKeyLen: articleId.length,
      correlationId: randomUUID().slice(0, 8),
    })
    const status =
      msg === 'ARTICLE_NOT_FOUND' || msg === 'PARENT_COMMENT_INVALID' ? 404 : msg === 'COMMENT_EMPTY' ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
