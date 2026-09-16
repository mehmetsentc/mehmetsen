import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { publisherRepository } from '@/services/publisher/publisherRepository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Active publisher memberships for the signed-in user.
 * Used for Profil nav / profile gate — not filtered by studio feature flags.
 */
export async function GET(request: Request) {
  const user = await verifyUserRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }

  const all = await publisherRepository.listPublishersForUser(user.uid)
  const publishers = all.map((p) => ({
    id: p.id,
    slug: p.slug,
    displayName: p.displayName,
    role: p.role,
    status: p.status,
    logoUrl: p.logoUrl,
  }))
  return NextResponse.json({ publishers })
}
