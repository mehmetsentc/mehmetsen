/**
 * SEO-1C.1 — permanent monthly article sitemap shards.
 *   /sitemaps/articles-YYYY-MM.xml      (part 1)
 *   /sitemaps/articles-YYYY-MM-N.xml    (part N >= 2, only above 50,000 URLs/month)
 *
 * www-canonical /haber/{slug} URLs only. Not a Google News sitemap.
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getSiteUrl } from '@/lib/seo'
import { getCitySlugFromHost } from '@/lib/cityHost'
import { getArticleMonth } from '@/lib/sitemap/articleSitemap'
import { articleUrlsetXml } from '@/lib/sitemap/articleSitemapEntries'
import {
  isClosedMonth,
  monthBoundsUtc,
  parseArticleShardFile,
  slicePart,
} from '@/lib/sitemap/articleSitemapPartition'
import { recordSitemapError } from '@/lib/seo/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const XML_TYPE = 'application/xml; charset=utf-8'

function notFound(): NextResponse {
  return new NextResponse('Not Found', {
    status: 404,
    headers: { 'Cache-Control': 'public, s-maxage=3600' },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params

  // City hosts never advertise these shards; article canonicals live on www.
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? ''
  if (getCitySlugFromHost(host)) return notFound()

  const shard = parseArticleShardFile(file)
  if (!shard) return notFound()

  const nowMs = Date.now()
  if (monthBoundsUtc(shard.month).startMs > nowMs) return notFound()

  let month
  try {
    month = await getArticleMonth(shard.month, nowMs)
  } catch (err) {
    recordSitemapError(`articles-${shard.month}`, err instanceof Error ? err.message : 'load_failed')
    return new NextResponse('Service Unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' },
    })
  }

  const entries = slicePart(month.entries, shard.part)
  if (entries.length === 0) return notFound()

  const closed = isClosedMonth(shard.month, nowMs)
  return new NextResponse(articleUrlsetXml(getSiteUrl(), entries), {
    headers: {
      'Content-Type': XML_TYPE,
      'Cache-Control': closed
        ? 'public, s-maxage=86400, stale-while-revalidate=3600'
        : 'public, s-maxage=3600, stale-while-revalidate=600',
    },
  })
}
