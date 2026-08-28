import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEffectiveForUser } from '@/lib/user/effectiveUserFlags'
import { requireSocialUser } from '@/lib/social/apiAuth'
import { socialGraphRepository } from '@/services/social/socialGraphRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ commentId: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const auth = await requireSocialUser(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await isSocialGraphEffectiveForUser(auth.uid)
  if (!allowed) {
    return NextResponse.json({ error: 'Social graph disabled' }, { status: 404 })
  }

  const { commentId } = await context.params
  const deleted = await socialGraphRepository.deleteComment(auth.uid, commentId)
  if (!deleted) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
