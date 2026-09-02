/**
 * Video Sitemap — VideoObject entries for Google Video search.
 * Spec: https://developers.google.com/search/docs/crawling-indexing/sitemaps/video-sitemaps
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import {
  canAppearInVideoSitemap,
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
} from '@/services/editorial/publicReadPolicy'

export const runtime = 'nodejs'
// force-dynamic kaldırıldı — her bot isteğinde 500 doc okutuyordu; ISR 30 dk yeterli
export const revalidate = 1800

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Firestore'da publishedAt 3 ayrı tipte olabilir:
 *   - number (unix ms)
 *   - string (ISO)
 *   - Timestamp ({seconds, nanoseconds} veya .toDate())
 * Geçerli bir ISO yoksa şimdiki zamanı döner — sitemap kırılmaz.
 */
function toISODateString(value: unknown): string {
  try {
    if (!value) return new Date().toISOString()
    if (typeof value === 'string') {
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
    }
    if (typeof value === 'number') {
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as { toDate?: () => Date; seconds?: number }
      if (typeof obj.toDate === 'function') return obj.toDate().toISOString()
      if (typeof obj.seconds === 'number') return new Date(obj.seconds * 1000).toISOString()
    }
    return new Date().toISOString()
  } catch {
    return new Date().toISOString()
  }
}

export async function GET() {
  const base = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  let items = ''

  try {
    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('hasVideo', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(500)
      .get()

    for (const doc of snap.docs) {
      const d = doc.data() as {
        title?: string
        slug?: string
        description?: string
        summary?: string
        coverImageUrl?: string
        videoUrl?: string
        publishedAt?: number
        readingTimeMinutes?: number
      }
      if (!d.videoUrl) continue

      const readClass = classifyPublicRead(
        publicReadMetaFromFirestoreDoc(doc.id, doc.data() as Record<string, unknown>)
      )
      if (!canAppearInVideoSitemap(readClass)) continue

      const slug = d.slug?.trim() || doc.id
      const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
      const url = `${base}${path}`
      const title = escapeXml(d.title?.trim() || 'Haber Videosu')
      const description = escapeXml((d.description || d.summary || d.title || '').slice(0, 500))
      const pubDate = toISODateString(d.publishedAt)
      const thumbnail = d.coverImageUrl?.trim() || `${base}/brand/og-default.png`
      const duration = (d.readingTimeMinutes ?? 2) * 60

      items += `
  <url>
    <loc>${escapeXml(url)}</loc>
    <video:video>
      <video:thumbnail_loc>${escapeXml(thumbnail)}</video:thumbnail_loc>
      <video:title>${title}</video:title>
      <video:description>${description}</video:description>
      <video:content_loc>${escapeXml(d.videoUrl)}</video:content_loc>
      <video:player_loc>${escapeXml(url)}</video:player_loc>
      <video:duration>${duration}</video:duration>
      <video:publication_date>${pubDate}</video:publication_date>
      <video:uploader info="${base}/hakkimizda">${escapeXml(siteName)}</video:uploader>
      <video:live>no</video:live>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>`
    }
  } catch (err) {
    console.error('[video-sitemap] error:', err)
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${items}
</urlset>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  })
}
