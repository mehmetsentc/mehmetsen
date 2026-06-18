import type { Metadata } from 'next'
import { FeedPageClient } from '@/components/feed/FeedPageClient'
import { getSiteUrl } from '@/lib/seo'
import { getLcpPreloadHref } from '@/lib/lcpImage'
import { getHomeFeedInitialData } from '@/services/newsService.server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getCategoryFamily } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import type { TimelinePost } from '@/types/post'

export const revalidate = 30

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Gündem — Son Dakika Haberler',
  description:
    'Türkiye gündeminden son dakika haberleri, güncel gelişmeler ve editoryal içerik — NaHaber',
  alternates: {
    canonical: `${siteUrl}${ROUTES.FEED}`,
  },
  openGraph: {
    title: 'Gündem — Son Dakika Haberler | NaHaber',
    description: 'Türkiye gündeminden son dakika haberleri — NaHaber',
    url: `${siteUrl}${ROUTES.FEED}`,
    type: 'website',
  },
}

/** Server-side: gündem kategorisinin ilk 20 haberini ISR cache için çek */
async function prefetchGundemPosts(): Promise<TimelinePost[]> {
  try {
    const db = getAdminFirestore()
    const family = getCategoryFamily('gundem')
    const baseQ = db.collection(Collections.NEWS).where('status', '==', 'published')
    const snap = await (
      family.length > 1
        ? baseQ.where('categoryId', 'in', family)
        : baseQ.where('categoryId', '==', 'gundem')
    )
      .orderBy('publishedAt', 'desc')
      .limit(20)
      .get()

    const ts = (v: unknown): number | null => {
      if (!v) return null
      if (typeof v === 'object' && 'toMillis' in (v as object)) {
        return (v as { toMillis(): number }).toMillis()
      }
      if (typeof v === 'number') return v
      if (typeof v === 'string') { const n = Date.parse(v); return isNaN(n) ? null : n }
      return null
    }

    return snap.docs.map(doc => {
      const d = doc.data()
      const image = d.coverImageUrl ?? d.thumbnail ?? d.imageUrl ?? d.featuredImage ?? null
      const videoUrl = d.videoUrl ?? ''
      const mediaItems = videoUrl
        ? [{ type: 'video' as const, url: videoUrl, thumbnailUrl: image, caption: null }]
        : image
          ? [{ type: 'image' as const, url: image, thumbnailUrl: image, caption: null }]
          : []
      return {
        id:                doc.id,
        authorUsername:    d.authorUsername    ?? '',
        authorDisplayName: d.authorDisplayName ?? '',
        authorId:          d.authorId          ?? '',
        title:             d.title             ?? '',
        spot:              d.spot              ?? d.summary ?? '',
        content:           d.content           ?? '',
        summary:           d.summary           ?? d.spot ?? '',
        categoryId:        d.categoryId        ?? '',
        citySlug:          d.citySlug          ?? '',
        city:              d.city              ?? null,
        cityName:          d.cityName          ?? '',
        coverImageUrl:     image,
        mediaItems,
        url:               d.url ?? ROUTES.NEWS_DETAIL(d.slug?.trim() || doc.id),
        slug:              d.slug    ?? doc.id,
        publishedAt:       ts(d.publishedAt) ?? ts(d.createdAt) ?? Date.now(),
        createdAt:         ts(d.createdAt)   ?? Date.now(),
        updatedAt:         ts(d.updatedAt)   ?? null,
        status:            d.status          ?? 'published',
        visibility:        d.visibility      ?? 'public',
        postType:          d.postType        ?? (videoUrl ? 'video' : 'news'),
        source:            d.source          ?? '',
        author:            d.author          ?? null,
        isBreaking:        d.isBreaking      ?? false,
        hasVideo:          d.hasVideo        ?? false,
        isVideo:           d.isVideo         ?? false,
        tags:              d.tags            ?? [],
        priorityScore:     d.priorityScore   ?? null,
        viewsCount:        d.viewsCount      ?? 0,
        likesCount:        d.likesCount      ?? 0,
        commentsCount:     d.commentsCount   ?? d.commentCount ?? 0,
        savesCount:        d.savesCount      ?? 0,
        sharesCount:       d.sharesCount     ?? 0,
      } as unknown as TimelinePost
    })
  } catch {
    return []
  }
}

export default async function FeedPage() {
  const [data, gundemInitialPosts] = await Promise.all([
    getHomeFeedInitialData(),
    prefetchGundemPosts(),
  ])

  const lcpImage =
    data.featured[0]?.imageUrl ??
    data.breaking[0]?.imageUrl ??
    data.latest[0]?.imageUrl ??
    null
  const lcpPreload = lcpImage ? getLcpPreloadHref(lcpImage) : null

  return (
    <>
      {lcpPreload ? (
        <link rel="preload" as="image" href={lcpPreload} fetchPriority="high" />
      ) : null}
      <FeedPageClient homeFeedData={data} gundemInitialPosts={gundemInitialPosts} />
    </>
  )
}
