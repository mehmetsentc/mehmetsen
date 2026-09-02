import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await verifyUserRequest(request)
  const allowed = await isSocialGraphEffectiveForUser(auth?.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Social graph disabled' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : ''
  if (!articleId) return NextResponse.json({ error: 'articleId required' }, { status: 400 })

  try {
    await socialGraphRepository.recordShare(auth?.uid ?? null, articleId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Share UX must succeed even when telemetry/persistence fails.
    console.info('[social.share]', {
      stage: 'record',
      code: err instanceof Error ? err.message : 'Share failed',
      articleKeyLen: articleId.length,
    })
    return NextResponse.json({ ok: true, telemetry: 'skipped' })
  }
}
