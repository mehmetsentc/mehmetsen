import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { isNewsCrawlerEnabled } from '@/services/crawler/enabled'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { paginateSlice, parseSourceListQuery, matchesSourceQuery } from '@/services/crawler/editorial/query'
import { PHASE0_SEED_SOURCES } from '@/services/crawler/seedSources'
import { TURKEY_SOURCE_REGISTRY, turkeyRegistryToInsert } from '@/services/crawler/turkeyRegistry'
import type { CrawlerSourceStatus, CrawlerQualityTier } from '@/services/crawler/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function dbOrError() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { error: 'DATABASE_URL missing', enabled: isNewsCrawlerEnabled(), postgres: false },
      { status: 503 }
    )
  }
  return null
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const missing = dbOrError()
  if (missing) return missing
  const store = new DrizzleCrawlerStore()
  const sources = await store.listSources()
  const url = new URL(request.url)
  const query = parseSourceListQuery(url)
  const filtered = sources.filter((s) => matchesSourceQuery(s, query))
  const page = paginateSlice(filtered, query.page, query.pageSize)
  return NextResponse.json({
    enabled: isNewsCrawlerEnabled(),
    postgres: true,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    sources: page.items,
  })
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const missing = dbOrError()
  if (missing) return missing

  const store = new DrizzleCrawlerStore()
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (body?.seedTurkey === true) {
    const existing = await store.listSources()
    const have = new Set(existing.map((s) => s.registryKey).filter(Boolean) as string[])
    const domains = new Set(existing.map((s) => s.domain.toLowerCase()))
    const created = []
    for (const entry of TURKEY_SOURCE_REGISTRY) {
      if (have.has(entry.key) || domains.has(entry.domain.toLowerCase())) continue
      created.push(await store.insertSource(turkeyRegistryToInsert(entry)))
      domains.add(entry.domain.toLowerCase())
    }
    return NextResponse.json({ seeded: created.length, totalRegistry: TURKEY_SOURCE_REGISTRY.length })
  }

  if (body?.approve === true) {
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const domain = typeof body?.domain === 'string' ? body.domain.trim() : ''
    const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : ''
    if (!name || !domain || !baseUrl) {
      return NextResponse.json({ error: 'name, domain, baseUrl required' }, { status: 400 })
    }
    const source = await store.insertSource({
      name,
      domain,
      baseUrl,
      countryCode: typeof body.countryCode === 'string' ? body.countryCode : 'TR',
      language: typeof body.language === 'string' ? body.language : 'tr',
      discoveryMethod: (body.discoveryMethod as never) || 'RSS',
      rssUrls: Array.isArray(body.rssUrls) ? body.rssUrls.map(String) : [],
      sitemapUrls: Array.isArray(body.sitemapUrls) ? body.sitemapUrls.map(String) : [],
      crawlIntervalSeconds: typeof body.crawlIntervalSeconds === 'number' ? body.crawlIntervalSeconds : 360,
      articleFetchMode: (body.articleFetchMode as never) || 'HTTP',
      requiresJavascript: Boolean(body.requiresJavascript),
      qualityTier: (body.qualityTier as CrawlerQualityTier) || 'UNTESTED',
      status: 'PAUSED',
    })
    return NextResponse.json({ source, approved: true })
  }

  if (body?.seed === true) {
    const existing = await store.listSources()
    if (existing.length) {
      return NextResponse.json({ error: 'Sources already exist', seeded: 0 }, { status: 409 })
    }
    const created = []
    for (const seed of PHASE0_SEED_SOURCES) {
      created.push(await store.insertSource(seed))
    }
    return NextResponse.json({ seeded: created.length, sources: created })
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const domain = typeof body?.domain === 'string' ? body.domain.trim() : ''
  const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : ''
  const countryCode = typeof body?.countryCode === 'string' ? body.countryCode.trim() : ''
  const language = typeof body?.language === 'string' ? body.language.trim() : ''
  if (!name || !domain || !baseUrl || !countryCode || !language) {
    return NextResponse.json({ error: 'name, domain, baseUrl, countryCode, language required' }, { status: 400 })
  }

  const source = await store.insertSource({
    name,
    domain,
    baseUrl,
    countryCode,
    countryName: typeof body?.countryName === 'string' ? body.countryName : null,
    city: typeof body?.city === 'string' ? body.city : null,
    language,
    sourceType: (body?.sourceType as never) || 'OTHER',
    discoveryMethod: (body?.discoveryMethod as never) || 'RSS',
    rssUrls: Array.isArray(body?.rssUrls) ? body.rssUrls.map(String) : [],
    sitemapUrls: Array.isArray(body?.sitemapUrls) ? body.sitemapUrls.map(String) : [],
    listingUrls: Array.isArray(body?.listingUrls) ? body.listingUrls.map(String) : [],
    crawlIntervalSeconds:
      typeof body?.crawlIntervalSeconds === 'number' ? body.crawlIntervalSeconds : 300,
    articleFetchMode: (body?.articleFetchMode as never) || 'HTTP',
    status: 'PAUSED',
  })
  return NextResponse.json({ source })
}

export async function PATCH(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const missing = dbOrError()
  if (missing) return missing

  const body = (await request.json().catch(() => null)) as { id?: string; status?: CrawlerSourceStatus } | null
  if (!body?.id || !body.status) {
    return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  }
  if (!['ACTIVE', 'PAUSED', 'DEGRADED', 'DISABLED'].includes(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }
  const store = new DrizzleCrawlerStore()
  const existing = await store.getSource(body.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await store.updateSource(body.id, { status: body.status })
  return NextResponse.json({ ok: true, id: body.id, status: body.status })
}
