/**
 * Google News Sitemap — only canonical articles published in the last 48 hours.
 * Phase P17.7H.3: Sourced directly from PostgreSQL canonical authority.
 * P18.3: intentionally excludes generic Firestore legacy corpus (CANONICAL /
 * SYSTEM_ALERT via PG only — no LEGACY_ALLOWED / LEGACY_QUARANTINED).
 * Spec: https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getSiteUrl } from '@/lib/seo'
import { getCitySlugFromHost } from '@/lib/cityHost'
import { ROUTES } from '@/constants/routes'
import { getCanonicalPublishedNewsForSitemap } from '@/lib/canonical/canonicalEligibility'

export const runtime = 'nodejs'
// ISR 30 dk — bot trafiği başına yeniden oluşturmayı engeller; Google News için yeterli
export const revalidate = 1800

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function GET() {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? ''
  const citySlug = getCitySlugFromHost(host)

  const base = citySlug ? `https://${citySlug}.nahaber.com` : getSiteUrl()
  const siteName = citySlug
    ? `NaHaber ${citySlug.charAt(0).toUpperCase() + citySlug.slice(1)}`
    : (process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber')
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000) // 48 hours ago

  let items = ''

  try {
    const rows = await getCanonicalPublishedNewsForSitemap({
      from: cutoff,
      citySlug: citySlug || undefined,
      limit: 200,
    })

    for (const d of rows) {
      const slug = d.slug?.trim() || d.id
      const path = ROUTES.NEWS_DETAIL(slug)
      const url = `${base}${path}`
      const pubDate = (d.publishedAt ?? new Date()).toISOString()
      const title = escapeXml(d.title?.trim() || 'Haber')
      const cover = d.coverImageUrl || d.thumbnailUrl
      const image = cover?.trim()
        ? `<image:image><image:loc>${escapeXml(cover.trim())}</image:loc><image:title>${title}</image:title></image:image>`
        : ''

      items += `
  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${pubDate}</lastmod>
    ${image}
    <news:news>
      <news:publication>
        <news:name>${escapeXml(siteName)}</news:name>
        <news:language>tr</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${title}</news:title>
      ${d.tags?.length ? `<news:keywords>${escapeXml(d.tags.join(', '))}</news:keywords>` : ''}
    </news:news>
  </url>`
    }
  } catch (error) {
    console.error('[news-sitemap] error generating sitemap:', error)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
>${items}
</urlset>`

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  })
}
