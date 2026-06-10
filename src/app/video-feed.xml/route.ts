/**
 * Video RSS feed — articles with video content.
 * Served at /video-feed.xml
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { buildRssFeed } from '@/lib/rss'
import { ROUTES } from '@/constants/routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 600

export async function GET() {
  const base = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const feedUrl = `${base}/video-feed.xml`

  try {
    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('hasVideo', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(50)
      .get()

    const items = snap.docs.map((doc) => {
      const d = doc.data() as {
        title?: string
        slug?: string
        summary?: string
        coverImageUrl?: string
        videoUrl?: string
        publishedAt?: number
      }
      const slug = d.slug?.trim() || doc.id
      const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
      const url = `${base}${path}`
      return {
        title: d.title?.trim() || 'Video Haber',
        link: url,
        guid: url,
        description: d.summary?.trim() || '',
        pubDate: new Date(d.publishedAt ?? Date.now()).toISOString(),
        imageUrl: d.coverImageUrl?.trim() || undefined,
        author: siteName,
      }
    })

    const xml = buildRssFeed({
      title: `${siteName} — Video Haberler`,
      description: "NaHaber video haber akışı.",
      link: feedUrl,
      items,
    })

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    })
  } catch (err) {
    console.error('[video-feed.xml] error:', err)
    return new NextResponse('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>', {
      status: 500,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
  }
}
