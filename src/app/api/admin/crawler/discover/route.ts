import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { autoDiscoverSource } from '@/services/crawler/discovery/autoDiscover'
import { testCrawlerSource } from '@/services/crawler/testSource'
import { TURKEY_SOURCE_REGISTRY, turkeyRegistryToInsert } from '@/services/crawler/turkeyRegistry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    registryCount: TURKEY_SOURCE_REGISTRY.length,
    sources: TURKEY_SOURCE_REGISTRY.map((s) => ({
      key: s.key,
      name: s.name,
      domain: s.domain,
      category: s.category,
      scope: s.scope,
      city: s.city ?? null,
      district: s.district ?? null,
      crawlPriority: s.crawlPriority,
    })),
    aiCalls: 0,
  })
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as {
    domain?: string
    test?: boolean
    key?: string
  } | null
  const domain = typeof body?.domain === 'string' ? body.domain.trim() : ''
  const registry = typeof body?.key === 'string' ? TURKEY_SOURCE_REGISTRY.find((s) => s.key === body.key) : undefined
  const target = domain || registry?.domain
  if (!target) return NextResponse.json({ error: 'domain required' }, { status: 400 })

  const discovered = await autoDiscoverSource({ domain: registry?.baseUrl || target })
  let test = null
  if (body?.test !== false) {
    const input = registry
      ? turkeyRegistryToInsert(registry)
      : {
          name: discovered.domain,
          domain: discovered.domain,
          baseUrl: discovered.baseUrl || `https://${discovered.domain}`,
          countryCode: discovered.countryCode,
          language: discovered.language,
          discoveryMethod: discovered.suggestedDiscoveryMethod,
          rssUrls: discovered.rssUrls,
          sitemapUrls: discovered.sitemapUrls,
          status: 'PAUSED' as const,
        }
    if (!input.rssUrls?.length && discovered.rssUrls.length) input.rssUrls = discovered.rssUrls
    if (!input.sitemapUrls?.length && discovered.sitemapUrls.length) input.sitemapUrls = discovered.sitemapUrls
    test = await testCrawlerSource({ input, persist: false, maxFetch: 3 })
  }
  return NextResponse.json({ discovered, test, aiCalls: 0 })
}
