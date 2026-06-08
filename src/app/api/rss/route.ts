import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 900

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const base = getSiteUrl()

  let itemsXml = ''

  try {
    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(50)
      .get()

    itemsXml = snap.docs
      .map((doc) => {
        const data = doc.data() as {
          title?: string
          description?: string
          slug?: string
          publishedAt?: number
          sourceLabel?: string
          thumbnail?: string
        }
        const slug = data.slug?.trim() || doc.id
        const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
        const link = `${base}${path}`
        const pubDate = new Date(data.publishedAt ?? Date.now()).toUTCString()
        const title = escapeXml(data.title?.trim() || 'Haber')
        const description = escapeXml((data.description?.trim() || '').slice(0, 500))
        const source = escapeXml(data.sourceLabel?.trim() || siteName)
        const image = data.thumbnail?.trim()
          ? `<enclosure url="${escapeXml(data.thumbnail)}" type="image/jpeg"/>`
          : ''

        return `<item>
  <title>${title}</title>
  <link>${link}</link>
  <guid isPermaLink="true">${link}</guid>
  <pubDate>${pubDate}</pubDate>
  <description>${description}</description>
  <author>${source}</author>
  ${image}
</item>`
      })
      .join('\n')
  } catch (error) {
    console.warn('[api/rss] fetch failed:', error)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${base}${ROUTES.FEED}</link>
    <description>${escapeXml(siteName)} — güncel haber akışı</description>
    <language>tr-TR</language>
    <atom:link href="${base}/api/rss" rel="self" type="application/rss+xml"/>
    ${itemsXml}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  })
}
