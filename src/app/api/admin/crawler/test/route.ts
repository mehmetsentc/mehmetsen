import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { testCrawlerSource } from '@/services/crawler/testSource'
import type { InsertSourceInput } from '@/services/crawler/store/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const domain = typeof body?.domain === 'string' ? body.domain.trim() : ''
  const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim() : ''
  const countryCode = typeof body?.countryCode === 'string' ? body.countryCode.trim() : ''
  const language = typeof body?.language === 'string' ? body.language.trim() : ''
  if (!name || !domain || !baseUrl || !countryCode || !language) {
    return NextResponse.json({ error: 'required fields missing' }, { status: 400 })
  }
  const input: InsertSourceInput = {
    name,
    domain,
    baseUrl,
    countryCode,
    language,
    discoveryMethod: (body?.discoveryMethod as InsertSourceInput['discoveryMethod']) || 'RSS',
    rssUrls: Array.isArray(body?.rssUrls) ? body.rssUrls.map(String) : [],
    sitemapUrls: Array.isArray(body?.sitemapUrls) ? body.sitemapUrls.map(String) : [],
    listingUrls: Array.isArray(body?.listingUrls) ? body.listingUrls.map(String) : [],
    crawlIntervalSeconds:
      typeof body?.crawlIntervalSeconds === 'number' ? body.crawlIntervalSeconds : 300,
    articleFetchMode: (body?.articleFetchMode as InsertSourceInput['articleFetchMode']) || 'HTTP',
    status: 'PAUSED',
  }
  const result = await testCrawlerSource({ input, persist: false, maxFetch: 3 })
  return NextResponse.json({ ...result, aiCalls: 0 })
}
