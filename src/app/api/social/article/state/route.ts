import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isSocialGraphEffectiveForUser } from '@/lib/user/effectiveUserFlags'
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
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50)

  const states = await socialGraphRepository.batchArticleState(auth?.uid ?? null, ids)
  return NextResponse.json({ states })
}
