/**
 * Google News Sitemap — only articles published in the last 48 hours.
 * Host-aware: city subdomains filter by citySlug and use city base URL.
 * Spec: https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { getCitySlugFromHost } from '@/lib/cityHost'
import { ROUTES } from '@/constants/routes'

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
  const cutoff = Date.now() - 48 * 60 * 60 * 1000 // 48 hours ago

  let items = ''

  try {
    const db = getAdminFirestore()

    // City subdomain: filter by citySlug first (uses existing composite index),
    // then apply date cutoff in JS to avoid requiring a new composite index.
    // National: date filter in Firestore is fine since that index already exists.
    const snap = citySlug
      ? await db
          .collection(Collections.NEWS)
          .where('status', '==', 'published')
          .where('citySlug', '==', citySlug)
          .orderBy('publishedAt', 'desc')
          .limit(300) // fetch more, then trim in JS
          .get()
      : await db
          .collection(Collections.NEWS)
          .where('status', '==', 'published')
          .where('publishedAt', '>=', cutoff)
          .orderBy('publishedAt', 'desc')
          .limit(200)
          .get()

    const docs = citySlug
      ? snap.docs.filter((doc) => {
          const d = doc.data() as { publishedAt?: number }
          return (d.publishedAt ?? 0) >= cutoff
        }).slice(0, 200)
      : snap.docs

    for (const doc of docs) {
      const d = doc.data() as {
        title?: string
        slug?: string
        publishedAt?: number
        categoryId?: string
        tags?: string[]
        coverImageUrl?: string
      }
      const slug = d.slug?.trim() || doc.id
      const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
      const url = `${base}${path}`
      const pubDate = new Date(d.publishedAt ?? Date.now()).toISOString()
      const title = escapeXml(d.title?.trim() || 'Haber')
      const image = d.coverImageUrl?.trim()
        ? `<image:image><image:loc>${escapeXml(d.coverImageUrl.trim())}</image:loc><image:title>${title}</image:title></image:image>`
        : ''

      items += `
  <url>
    <loc>${url}</loc>
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
  } catch (err) {
    console.error('[news-sitemap] error:', err)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${items}
</urlset>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
