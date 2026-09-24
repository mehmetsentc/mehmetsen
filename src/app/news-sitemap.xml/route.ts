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
  NEWS_SITEMAP_ERROR_CACHE_CONTROL,
  newsPartCount,
  newsSitemapIndexXml,
  newsUrlsetXml,
} from '@/lib/sitemap/newsSitemap'
import { recordSitemapError } from '@/lib/seo/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const XML_TYPE = 'application/xml; charset=utf-8'

function xml(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': XML_TYPE, 'Cache-Control': NEWS_SITEMAP_CACHE_CONTROL },
  })
}

export async function GET() {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? ''
  if (getCitySlugFromHost(host)) {
    return xml(newsUrlsetXml(getSiteUrl(), []))
  }

  let entries
  try {
    entries = entriesInWindow(await getNewsSitemapEntries(), Date.now())
  } catch (error) {
    recordSitemapError('news', error instanceof Error ? error.message : 'load_failed')
    console.error('[news-sitemap] source failure — serving 503:', error)
    return new NextResponse('Service Unavailable', {
      status: 503,
      headers: { 'Cache-Control': NEWS_SITEMAP_ERROR_CACHE_CONTROL, 'Retry-After': '300' },
    })
  }

  const base = getSiteUrl()
  const parts = newsPartCount(entries.length)
  if (parts <= 1) return xml(newsUrlsetXml(base, entries))
  return xml(newsSitemapIndexXml(base, parts))
}
