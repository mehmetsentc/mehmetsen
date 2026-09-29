/**
 * Google News sitemap — articles published in the last 48 hours.
 * SEO-2B: Firestore + PostgreSQL canonical sources (same authority and
 * eligibility as the permanent monthly article sitemaps, SEO-1C.1).
 *
 * - www: <= 1,000 entries → news urlset; above → sitemap index of
 *   /news-sitemaps/news-N.xml (each <= 1,000), newest first.
 * - city hosts: valid empty urlset (article canonicals live on www).
 * - source failure / raw cap exceeded: 503 + no-store (never a misleading empty file).
 * Spec: https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getSiteUrl } from '@/lib/seo'
import { getCitySlugFromHost } from '@/lib/cityHost'
import { getNewsSitemapEntries } from '@/lib/sitemap/newsSitemapLoader'
import {
  entriesInWindow,
  NEWS_SITEMAP_CACHE_CONTROL,
  NEWS_SITEMAP_REVALIDATE_S,
  NEWS_SITEMAP_ERROR_CACHE_CONTROL,
  newsPartCount,
  newsSitemapIndexXml,
  newsUrlsetXml,
} from '@/lib/sitemap/newsSitemap'
import { recordSitemapError } from '@/lib/seo/observability'
import { createTtlSingleCache } from '@/lib/sitemap/imageSitemapCache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const XML_TYPE = 'application/xml; charset=utf-8'

function xml(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': XML_TYPE, 'Cache-Control': NEWS_SITEMAP_CACHE_CONTROL },
  })
}

const NEWS_SITEMAP_TTL_MS = NEWS_SITEMAP_REVALIDATE_S * 1000

const getWwwNewsSitemap = createTtlSingleCache(async () => {
  const entries = entriesInWindow(await getNewsSitemapEntries(), Date.now())
  const base = getSiteUrl()
  const parts = newsPartCount(entries.length)
  return parts <= 1 ? newsUrlsetXml(base, entries) : newsSitemapIndexXml(base, parts)
}, NEWS_SITEMAP_TTL_MS)

export async function GET() {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? ''
  if (getCitySlugFromHost(host)) {
    return xml(newsUrlsetXml(getSiteUrl(), []))
  }

  try {
    if (process.env.VITEST === 'true') {
      const entries = entriesInWindow(await getNewsSitemapEntries(), Date.now())
      const base = getSiteUrl()
      const parts = newsPartCount(entries.length)
      return xml(parts <= 1 ? newsUrlsetXml(base, entries) : newsSitemapIndexXml(base, parts))
    }
    const { xml: body, cache } = await getWwwNewsSitemap()
    if (cache !== 'miss') {
      console.info('[finops_public_cache]', JSON.stringify({ route: 'news-sitemap', cache, documentsRead: 0 }))
    }
    return xml(body)
  } catch (error) {
    recordSitemapError('news', error instanceof Error ? error.message : 'load_failed')
    console.error('[news-sitemap] source failure — serving 503:', error)
    return new NextResponse('Service Unavailable', {
      status: 503,
      headers: { 'Cache-Control': NEWS_SITEMAP_ERROR_CACHE_CONTROL, 'Retry-After': '300' },
    })
  }
}
