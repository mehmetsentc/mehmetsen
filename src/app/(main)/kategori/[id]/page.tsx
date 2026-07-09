import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { DEFAULT_CATEGORIES, getSubcategories, getCategoryFamily, type CategoryDef } from '@/constants/config'
import { CategoryPageClient } from '@/components/category/CategoryPageClient'
import { CategoryStructuredData } from '@/components/category/CategoryStructuredData'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { TimelinePost } from '@/types/post'
import { getWorldCup2026Data } from '@/services/sportsApi/worldCup2026'

interface Props {
  params: Promise<{ id: string }>
}

/** Server-side: ilk 20 haberi Admin SDK ile çek (ISR cache'lenecek) */
async function prefetchCategoryPosts(categoryId: string): Promise<TimelinePost[]> {
  try {
    const db = getAdminFirestore()
    const baseQ = db.collection(Collections.NEWS).where('status', '==', 'published')

    const snap = categoryId === 'son-dakika'
      ? await baseQ
          .where('isBreaking', '==', true)
          .orderBy('publishedAt', 'desc')
          .limit(20)
          .get()
      : await (() => {
          const family = getCategoryFamily(categoryId)
          return (
            family.length > 1
              ? baseQ.where('categoryId', 'in', family)
              : baseQ.where('categoryId', '==', categoryId)
          )
            .orderBy('publishedAt', 'desc')
            .limit(20)
            .get()
        })()

    return snap.docs.map(doc => {
      const d = doc.data()
      const image =
        d.coverImageUrl ??
        d.thumbnail ??
        d.imageUrl ??
        d.featuredImage ??
        null
      const videoUrl = d.videoUrl ?? ''
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
        if (typeof v === 'string') { const n = Date.parse(v); return isNaN(n) ? null : n }
        return null
      }
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
        url:               d.url               ?? ROUTES.NEWS_DETAIL(d.slug?.trim() || doc.id),
        slug:              d.slug              ?? doc.id,
        publishedAt:       ts(d.publishedAt)   ?? ts(d.createdAt) ?? Date.now(),
        createdAt:         ts(d.createdAt)     ?? Date.now(),
        updatedAt:         ts(d.updatedAt)     ?? null,
        status:            d.status            ?? 'published',
        visibility:        d.visibility        ?? 'public',
        postType:          d.postType          ?? (videoUrl ? 'video' : 'news'),
        source:            d.source            ?? '',
        author:            d.author            ?? null,
        isBreaking:        d.isBreaking        ?? false,
        hasVideo:          d.hasVideo          ?? false,
        isVideo:           d.isVideo           ?? false,
        tags:              d.tags              ?? [],
        priorityScore:     d.priorityScore     ?? null,
        viewsCount:        d.viewsCount        ?? 0,
        likesCount:        d.likesCount        ?? 0,
        commentsCount:     d.commentsCount     ?? d.commentCount ?? 0,
        savesCount:        d.savesCount        ?? 0,
        sharesCount:       d.sharesCount       ?? 0,
      } as unknown as TimelinePost
    })
  } catch {
    return []
  }
}

function getCategoryMeta(id: string) {
  return DEFAULT_CATEGORIES.find((c) => c.slug === id || c.id === id) ?? null
}

function getCategoryPageTitle(cat: CategoryDef): string {
  if (cat.id === 'yerel-haber') return 'Şehrinizden Haberler'
  if (cat.id === 'son-dakika') return 'Son Dakika Haberleri'
  return `${cat.name} Haberleri`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const cat = getCategoryMeta(id)
  if (!cat) return { title: 'Kategori' }

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const pageTitle = getCategoryPageTitle(cat)
  const description = `${cat.name} kategorisindeki son dakika haberler, güncel gelişmeler ve editoryal içerik — ${siteName}`

  return {
    title: `${pageTitle} | ${siteName}`,
    description,
    keywords: [cat.name, `${cat.name} haberleri`, 'son dakika', siteName, 'Türkiye haberleri'],
    robots: { index: true, follow: true },
    alternates: {
      canonical: `${siteUrl}${ROUTES.CATEGORY(cat.slug ?? cat.id)}`,
    },
    openGraph: {
      title: `${pageTitle} | ${siteName}`,
      description,
      url: `${siteUrl}${ROUTES.CATEGORY(cat.slug ?? cat.id)}`,
      type: 'website',
      locale: 'tr_TR',
      siteName,
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: `${pageTitle} | ${siteName}`,
      description,
    },
  }
}

export function generateStaticParams() {
  return DEFAULT_CATEGORIES.map((cat) => ({ id: cat.slug }))
}

export const revalidate = 60

export default async function CategoryPage({ params }: Props) {
  const { id } = await params
  const cat = getCategoryMeta(id)
  if (!cat) notFound()

  const isSubcategory = !!cat.parentId
  const parentCat: CategoryDef | null = isSubcategory
    ? (DEFAULT_CATEGORIES.find(c => c.id === cat.parentId) ?? null)
    : null

  const tabParent = parentCat ?? cat
  const subcategories = getSubcategories(tabParent.id)
  const showTabs = subcategories.length > 0
  const headerCat = parentCat ?? cat

  const subTabs = subcategories.map((sub) => ({
    id: sub.id,
    slug: sub.slug,
    name: sub.name,
    color: sub.color,
    href: `/kategori/${sub.slug}`,
    active: sub.id === cat.id,
  }))

  const initialPosts = await prefetchCategoryPosts(cat.id)
  const worldCupData = cat.id === 'dunya-kupasi-2026' ? await getWorldCup2026Data() : null

  return (
    <>
      <CategoryStructuredData cat={cat} posts={initialPosts} />
      <Suspense
        fallback={
          <div className="space-y-4 p-4">
            {[...Array(4)].map((_, i) => (
              <TimelineItemSkeleton key={i} />
            ))}
          </div>
        }
      >
        <CategoryPageClient
          cat={cat}
          headerCat={headerCat}
          isSubcategory={isSubcategory}
          parentCat={parentCat}
          subTabs={subTabs}
          tabParent={tabParent}
          showTabs={showTabs}
          initialPosts={initialPosts}
          worldCupData={worldCupData}
        />
      </Suspense>
    </>
  )
}
