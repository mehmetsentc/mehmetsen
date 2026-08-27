/**
 * National sitemap index — minimal deps (no publisher/event/drizzle).
 */
import { getSiteUrl } from '@/lib/seo'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import { xmlEscape } from '@/lib/sitemap/seoXml'
import { recordSitemapError } from '@/lib/seo/observability'

export async function buildSitemapIndexXmlAsync(base = getSiteUrl()): Promise<string> {
  let pageCount = 1
  try {
    const { getSitemapPageCount } = await import('@/lib/sitemap/mainSitemap')
    pageCount = await getSitemapPageCount()
  } catch (err) {
    recordSitemapError('index', err instanceof Error ? err.message : 'page_count_failed')
    pageCount = 1
  }

  const newsChunks = Array.from({ length: pageCount }, (_, i) => ({
    loc: `${base}/sitemap/${i}.xml`,
  }))
  const dedicated = [
    `${base}/news-sitemap.xml`,
    `${base}/video-sitemap.xml`,
    `${base}/images-sitemap.xml`,
    `${base}/sitemap-publishers.xml`,
    `${base}/sitemap-cities.xml`,
    `${base}/sitemap-districts.xml`,
    `${base}/sitemap-categories.xml`,
    `${base}/sitemap-topics.xml`,
    ...(isEventPagesEnabled() ? [`${base}/sitemap-events.xml`] : []),
  ].map((loc) => ({ loc }))

  const items = [...dedicated, ...newsChunks]
    .map(
      (item) =>
        `  <sitemap>\n    <loc>${xmlEscape(item.loc)}</loc>\n  </sitemap>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`
}
