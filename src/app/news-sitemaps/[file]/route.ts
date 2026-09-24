/**
 * SEO-2B — Google News sitemap overflow parts (only when > 1,000 entries).
 * /news-sitemaps/news-N.xml, advertised by /news-sitemap.xml when it is an index.
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
  newsSlice,
  newsUrlsetXml,
  parseNewsChildFile,
} from '@/lib/sitemap/newsSitemap'
import { recordSitemapError } from '@/lib/seo/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function notFound(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': NEWS_SITEMAP_CACHE_CONTROL },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? ''
  if (getCitySlugFromHost(host)) return notFound()

  const part = parseNewsChildFile(file)
  if (part == null) return notFound()

  let entries
  try {
    entries = entriesInWindow(await getNewsSitemapEntries(), Date.now())
  } catch (error) {
    recordSitemapError('news', error instanceof Error ? error.message : 'load_failed')
    return new NextResponse('Service Unavailable', {
      status: 503,
      headers: { 'Cache-Control': NEWS_SITEMAP_ERROR_CACHE_CONTROL, 'Retry-After': '300' },
    })
  }

  const parts = newsPartCount(entries.length)
  // Children exist only while the root is an index (> 1,000 entries).
  if (parts <= 1 || part > parts) return notFound()

  return new NextResponse(newsUrlsetXml(getSiteUrl(), newsSlice(entries, part)), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': NEWS_SITEMAP_CACHE_CONTROL,
    },
  })
}
