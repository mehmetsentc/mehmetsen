import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { databaseUnavailableResponse } from '@/lib/adminApiError'
import { hasDatabaseUrl } from '@/db'
import { publisherRepository } from '@/services/publisher/publisherRepository'
import type { PublisherAdminFilter } from '@/types/publisher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function dbOr503() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(databaseUnavailableResponse({ postgres: false }), { status: 503 })
  }
  return null
}

function parseFilter(raw: string | null): PublisherAdminFilter {
  const v = (raw ?? 'all').toLowerCase()
  if (v === 'unclaimed' || v === 'pending' || v === 'verified' || v === 'rejected') return v
  return 'all'
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const missing = dbOr503()
  if (missing) return missing

  const url = new URL(request.url)
  const filter = parseFilter(url.searchParams.get('filter'))
  const id = url.searchParams.get('id')

  try {
    if (id) {
      const publisher = await publisherRepository.findById(id)
      if (!publisher) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const sources = await publisherRepository.listSourcesForPublisher(id)
      const claims = await publisherRepository.listClaimsForPublisher(id)
      return NextResponse.json({ publisher, sources, claims })
    }

    const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
    const pageSize = Math.min(Math.max(Number(url.searchParams.get('pageSize') ?? 50), 1), 100)
    const { items, total } = await publisherRepository.listPublishers({
      filter,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return NextResponse.json({ items, total, page, pageSize, filter })
  } catch (err) {
    console.error('[admin/publishers GET]', err)
    return NextResponse.json({ error: 'Failed to load publishers' }, { status: 500 })
  }
}
