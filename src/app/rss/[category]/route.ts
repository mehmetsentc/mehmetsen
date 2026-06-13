/**
 * Per-category RSS feeds.
 * Served at /rss/[category] e.g. /rss/spor, /rss/teknoloji
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { buildRssFeed } from '@/lib/rss'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { getCategoryLabel } from '@/lib/newsMapper'

export const runtime = 'nodejs'
// force-dynamic kaldırıldı — ISR ile cache edilecek
export const revalidate = 300

export async function generateStaticParams() {
  return DEFAULT_CATEGORIES.map((cat) => ({ category: cat.slug }))
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params
  const base = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  const catDef = DEFAULT_CATEGORIES.find((c) => c.slug === category || c.id === category)
  if (!catDef) {
    return new NextResponse('Not found', { status: 404 })
  }

  const feedUrl = `${base}/rss/${catDef.slug}`
  const catLabel = getCategoryLabel(catDef.id)

  try {
    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('categoryId', '==', catDef.id)
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
        source?: string
      }
      const slug = d.slug?.trim() || doc.id
      const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
      const url = `${base}${path}`
      return {
        title: d.title?.trim() || 'Haber',
        link: url,
        guid: url,
        description: d.summary?.trim() || '',
        pubDate: new Date(d.publishedAt ?? Date.now()).toISOString(),
        category: catLabel,
        imageUrl: d.coverImageUrl?.trim() || undefined,
        author: d.source?.trim() || siteName,
      }
    })

    const xml = buildRssFeed({
      title: `${siteName} — ${catLabel} Haberleri`,
      description: `${catLabel} kategorisinden son haberler — ${siteName}.`,
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
    console.error(`[rss/${category}] error:`, err)
    return new NextResponse('<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>', {
      status: 500,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    })
  }
}
