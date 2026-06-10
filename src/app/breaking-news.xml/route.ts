/**
 * Breaking news RSS feed — only articles from last 6 hours.
 * Served at /breaking-news.xml
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { buildRssFeed } from '@/lib/rss'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 120

export async function GET() {
  const base = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const feedUrl = `${base}/breaking-news.xml`
  const since = Date.now() - 6 * 60 * 60 * 1000 // last 6h

  try {
    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('publishedAt', '>=', since)
      .orderBy('publishedAt', 'desc')
      .limit(50)
      .get()

    const items = snap.docs.map((doc) => {
      const d = doc.data() as {
        title?: string
        slug?: string
        summary?: string
        coverImageUrl?: string
        publishedAt?: number
        categoryId?: string
        source?: string
      }
      const slug = d.slug?.trim() || doc.id
      const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
      const url = `${base}${path}`
      return {
        title: d.title?.trim() || 'Son Dakika',
        link: url,
        guid: url,
        description: d.summary?.trim() || '',
        pubDate: new Date(d.publishedAt ?? Date.now()).toISOString(),
        category: d.categoryId ? getCategoryLabel(d.categoryId) : undefined,
        imageUrl: d.coverImageUrl?.trim() || undefined,
        author: d.source?.trim() || siteName,
      }
    })

    const xml = buildRssFeed({
      title: `${siteName} — Son Dakika`,
      description: "Son 6 saatte yayınlanan son dakika haberler.",
      link: feedUrl,
      items,
    })

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240',
      },
    })
  } catch (err) {
    console.error('[breaking-news.xml] error:', err)
    return new NextResponse('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>', {
      status: 500,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
  }
}
