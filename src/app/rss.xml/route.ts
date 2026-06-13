/**
 * Main RSS feed — latest 100 published articles.
 * Served at /rss.xml
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { buildRssFeed } from '@/lib/rss'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'

export const runtime = 'nodejs'
// force-dynamic kaldırıldı — her RSS reader isteğinde 100 doc okutuyordu; ISR 5 dk yeterli
export const revalidate = 300

export async function GET() {
  const base = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const feedUrl = `${base}/rss.xml`

  try {
    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(100)
      .get()

    const items = snap.docs.map((doc) => {
      const d = doc.data() as {
        title?: string
        slug?: string
        summary?: string
        content?: string
        coverImageUrl?: string
        publishedAt?: number
        categoryId?: string
        source?: string
      }
      const slug = d.slug?.trim() || doc.id
      const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
      const url = `${base}${path}`
      return {
        title: d.title?.trim() || 'Haber',
        link: url,
        guid: url,
        description: d.summary?.trim() || d.content?.slice(0, 300) || '',
        pubDate: new Date(d.publishedAt ?? Date.now()).toISOString(),
        category: d.categoryId ? getCategoryLabel(d.categoryId) : undefined,
        imageUrl: d.coverImageUrl?.trim() || undefined,
        author: d.source?.trim() || siteName,
      }
    })

    const xml = buildRssFeed({
      title: `${siteName} — Son Dakika Haberler`,
      description: "Türkiye'nin anlık haber platformu. Son dakika, gündem, spor, teknoloji.",
      link: feedUrl,
      items,
    })

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    console.error('[rss.xml] error:', err)
    return new NextResponse('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>', {
      status: 500,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
  }
}
