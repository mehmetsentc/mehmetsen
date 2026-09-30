import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getHomeFeedCategoryFamily, isKibrisCategoryTree } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { isKibrisScopedNews, isNationalBreakingEligible } from '@/lib/featuredScope'
import { featuredPinTime } from '@/lib/featuredPins'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { selectNewsCardFields } from '@/lib/news/cardFirestoreFields'
import type { TimelinePost } from '@/types/post'

/** Cross-request public first page. Rollback: delete this module and inline the fetch. */
export const CATEGORY_FIRST_PAGE_REVALIDATE_S = 45
export const CATEGORY_FIRST_PAGE_CACHE_KEY = 'category-first-page-v1'

function mapNewsDocToTimelinePost(doc: {
  id: string
  data: () => Record<string, unknown>
}): TimelinePost {
  const d = doc.data()
  const image =
    (d.coverImageUrl as string | undefined) ??
    (d.thumbnail as string | undefined) ??
    (d.imageUrl as string | undefined) ??
    (d.featuredImage as string | undefined) ??
    null
  const videoUrl = (d.videoUrl as string | undefined) ?? ''
  const mediaItems = videoUrl
    ? [{ type: 'video' as const, url: videoUrl, thumbnailUrl: image, caption: null }]
    : image
      ? [{ type: 'image' as const, url: image, thumbnailUrl: image, caption: null }]
      : []
  const ts = (v: unknown): number | null => {
    if (!v) return null
    if (typeof v === 'object' && 'toMillis' in (v as object)) {
      return (v as { toMillis(): number }).toMillis()
    }
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const n = Date.parse(v)
      return isNaN(n) ? null : n
    }
    return null
  }
  const slug = typeof d.slug === 'string' ? d.slug : undefined
  return {
    id: doc.id,
    authorUsername: (d.authorUsername as string | undefined) ?? '',
    authorDisplayName: (d.authorDisplayName as string | undefined) ?? '',
    authorId: (d.authorId as string | undefined) ?? '',
    title: (d.title as string | undefined) ?? '',
    spot: (d.spot as string | undefined) ?? (d.summary as string | undefined) ?? '',
    content:
      (d.summary as string | undefined) ??
      (d.spot as string | undefined) ??
      (d.description as string | undefined) ??
      '',
    summary: (d.summary as string | undefined) ?? (d.spot as string | undefined) ?? '',
    categoryId: (d.categoryId as string | undefined) ?? '',
    originalCategoryId: (d.originalCategoryId as string | undefined) ?? '',
    isBreaking: d.isBreaking === true || (d.categoryId as string | undefined) === 'son-dakika',
    citySlug: (d.citySlug as string | undefined) ?? '',
    city: d.city ?? null,
    cityName: (d.cityName as string | undefined) ?? '',
    coverImageUrl: image,
    mediaItems,
    url: (d.url as string | undefined) ?? ROUTES.NEWS_DETAIL(slug?.trim() || doc.id),
    slug: slug ?? doc.id,
    publishedAt: ts(d.publishedAt) ?? ts(d.createdAt) ?? Date.now(),
    createdAt: ts(d.createdAt) ?? Date.now(),
    updatedAt: ts(d.updatedAt) ?? null,
    status: (d.status as string | undefined) ?? 'published',
    visibility: (d.visibility as string | undefined) ?? 'public',
    postType: (d.postType as string | undefined) ?? (videoUrl ? 'video' : 'news'),
    source: (d.source as string | undefined) ?? '',
    author: d.author ?? null,
    hasVideo: d.hasVideo === true,
    isVideo: d.isVideo === true,
    featured: d.featured === true,
    isEditorPick: d.isEditorPick === true || d.featured === true,
    tags: (d.tags as string[] | undefined) ?? [],
    priorityScore: (d.priorityScore as number | null | undefined) ?? null,
    viewsCount: (d.viewsCount as number | undefined) ?? 0,
    likesCount: (d.likesCount as number | undefined) ?? 0,
    commentsCount:
      (d.commentsCount as number | undefined) ?? (d.commentCount as number | undefined) ?? 0,
    savesCount: (d.savesCount as number | undefined) ?? 0,
    sharesCount: (d.sharesCount as number | undefined) ?? 0,
  } as unknown as TimelinePost
}

async function fetchCategoryFirstPage(categoryId: string): Promise<TimelinePost[]> {
  const db = getAdminFirestore()
  const baseQ = db.collection(Collections.NEWS).where('status', '==', 'published')

  const family = getHomeFeedCategoryFamily(categoryId)
  const listQuery =
    categoryId === 'son-dakika'
      ? baseQ.where('isBreaking', '==', true).orderBy('publishedAt', 'desc').limit(40)
      : (family.length > 1
          ? baseQ.where('categoryId', 'in', family)
          : baseQ.where('categoryId', '==', categoryId)
        )
          .orderBy('publishedAt', 'desc')
          .limit(20)

  const snap = await selectNewsCardFields(listQuery).get()

  let posts = snap.docs.map((doc) => mapNewsDocToTimelinePost(doc))

  if (categoryId === 'son-dakika') {
    posts = posts
      .filter((post) =>
        isNationalBreakingEligible({
          categoryId: post.categoryId,
          originalCategoryId: post.originalCategoryId,
          citySlug: post.citySlug,
        })
      )
      .slice(0, 20)
  }

  if (isKibrisCategoryTree(categoryId)) {
    const family = new Set(getHomeFeedCategoryFamily(categoryId))
    const belongsOnKibrisPage = (post: TimelinePost) =>
      family.has(String(post.categoryId ?? '').trim()) ||
      isKibrisScopedNews({
        categoryId: post.categoryId,
        originalCategoryId: post.originalCategoryId,
      })
    try {
      const featSnap = await selectNewsCardFields(
        baseQ.where('featured', '==', true).orderBy('publishedAt', 'desc').limit(40)
      ).get()
      const pinned = featSnap.docs
        .map((doc) => {
          const data = doc.data() as Record<string, unknown>
          return {
            post: mapNewsDocToTimelinePost(doc),
            pinAt: featuredPinTime(data),
          }
        })
        .filter(({ post }) => belongsOnKibrisPage(post))
        .sort((a, b) => b.pinAt - a.pinAt)
        .map(({ post }) => post)

      if (pinned.length > 0) {
        const seen = new Set(pinned.map((p) => p.id))
        posts = [...pinned, ...posts.filter((p) => !seen.has(p.id))].slice(0, 24)
      } else {
        posts = [...posts].sort(
          (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))
        )
      }
    } catch {
      posts = [...posts].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    }

    try {
      const breakingSnap = await selectNewsCardFields(
        baseQ.where('isBreaking', '==', true).orderBy('publishedAt', 'desc').limit(30)
      ).get()
      const kibrisBreaking = breakingSnap.docs
        .map((doc) => mapNewsDocToTimelinePost(doc))
        .filter((post) => belongsOnKibrisPage(post))
      if (kibrisBreaking.length > 0) {
        const seen = new Set(posts.map((p) => p.id))
        posts = [...kibrisBreaking.filter((p) => !seen.has(p.id)), ...posts].slice(0, 24)
      }
    } catch {
      /* breaking merge is best-effort */
    }
  }

  return JSON.parse(JSON.stringify(posts)) as TimelinePost[]
}

const getCategoryFirstPageCached = unstable_cache(
  fetchCategoryFirstPage,
  [CATEGORY_FIRST_PAGE_CACHE_KEY],
  { revalidate: CATEGORY_FIRST_PAGE_REVALIDATE_S, tags: ['category-feed'] }
)

/**
 * National /kategori first window.
 * Request-scoped `cache()` collapses generateMetadata + page.
 * `unstable_cache` shares the public pool across requests for 45s.
 */
export const prefetchCategoryPosts = cache(async (categoryId: string): Promise<TimelinePost[]> => {
  const id = categoryId.trim().toLowerCase()
  if (!id) return []
  try {
    return await getCategoryFirstPageCached(id)
  } catch {
    return []
  }
})
