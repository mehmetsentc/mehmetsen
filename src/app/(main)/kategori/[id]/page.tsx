import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { DEFAULT_CATEGORIES, getSubcategories, getCategoryFamily, type CategoryDef } from '@/constants/config'
import { CategoryFeed } from '@/components/feed/CategoryFeed'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { TimelinePost } from '@/types/post'

// Dinamik import — TradingView scriptleri window gerektirir, SSR kapalı
const BorsaWidget = dynamic(
  () => import('@/components/widgets/BorsaWidget').then((m) => m.BorsaWidget),
  { ssr: false }
)

interface Props {
  params: Promise<{ id: string }>
}

/** Server-side: ilk 20 haberi Admin SDK ile çek (ISR cache'lenecek) */
async function prefetchCategoryPosts(categoryId: string): Promise<TimelinePost[]> {
  try {
    const db = getAdminFirestore()
    const family = getCategoryFamily(categoryId)
    const baseQ = db.collection(Collections.NEWS).where('status', '==', 'published')
    const snap = await (
      family.length > 1
        ? baseQ.where('categoryId', 'in', family)
        : baseQ.where('categoryId', '==', categoryId)
    )
      .orderBy('publishedAt', 'desc')
      .limit(20)
      .get()

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
      // Firestore Timestamp'leri sayıya çevir — RSC→Client serialize edilebilir olmalı
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
    return []   // prefetch başarısız → client normal akışa devam eder
  }
}

function getCategoryMeta(id: string) {
  return DEFAULT_CATEGORIES.find((c) => c.slug === id) ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const cat = getCategoryMeta(id)
  if (!cat) return { title: 'Kategori' }
  // "Yerel Haber Haberleri" yerine "Şehrinizden Haberler"
  const pageTitle = cat.id === 'yerel-haber'
    ? 'Şehrinizden Haberler'
    : cat.id === 'son-dakika'
    ? 'Son Dakika'
    : `${cat.name} Haberleri`
  return {
    title: pageTitle,
    description: `NaHaber'de ${cat.name} kategorisindeki son dakika gelişmeleri ve haberler`,
    alternates: {
      canonical: `${getSiteUrl()}${ROUTES.CATEGORY(cat.id)}`,
    },
    openGraph: {
      title: `${pageTitle} | NaHaber`,
      description: `NaHaber'de ${cat.name} kategorisindeki son dakika gelişmeleri ve haberler`,
      url: `${getSiteUrl()}${ROUTES.CATEGORY(cat.id)}`,
    },
  }
}

export function generateStaticParams() {
  return DEFAULT_CATEGORIES.map((cat) => ({ id: cat.slug }))
}

// ISR: Vercel CDN caches category shells; feed hydrates client-side.
export const revalidate = 60

export default async function CategoryPage({ params }: Props) {
  const { id } = await params
  const cat = getCategoryMeta(id)
  if (!cat) notFound()

  // Alt kategorideyse (parentId var) üst kategoriden tab çubuğunu al
  const isSubcategory = !!cat.parentId
  const parentCat: CategoryDef | null = isSubcategory
    ? (DEFAULT_CATEGORIES.find(c => c.id === cat.parentId) ?? null)
    : null

  // Tab çubuğu: ana kategori ise kendi alt kategorileri, alt kategori ise üst kategorinin alt kategorileri
  const tabParent = parentCat ?? cat
  const subcategories = getSubcategories(tabParent.id)
  const showTabs = subcategories.length > 0

  // Header: alt kategorideyse üst kategori adını da göster
  const headerCat = parentCat ?? cat

  // Server-side prefetch — skeleton göstermeden anında içerik
  const initialPosts = await prefetchCategoryPosts(cat.id)

  return (
    <div className="w-full">
      {/* Category header */}
      <div
        className="mb-3 flex items-center gap-3 rounded-2xl px-4 py-2.5"
        style={{ backgroundColor: `${headerCat.color}18`, borderLeft: `4px solid ${headerCat.color}` }}
      >
        <div>
          <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))]">
            {isSubcategory ? `${parentCat?.name} · ${cat.name}` : cat.name}
          </h1>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            {cat.name} kategorisindeki son gelişmeler
          </p>
        </div>
      </div>

      {/* Kaydırmalı tab çubuğu — hem ana hem alt kategori sayfalarında görünür */}
      {showTabs && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
          {/* "Tümü" → üst kategoriye gider */}
          <Link
            href={`/kategori/${tabParent.slug}`}
            className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
            style={
              !isSubcategory
                ? { backgroundColor: `${tabParent.color}25`, color: tabParent.color, borderColor: `${tabParent.color}50` }
                : { borderColor: 'rgb(var(--color-border))', color: 'rgb(var(--color-muted))' }
            }
          >
            Tümü
          </Link>

          {subcategories.map((sub) => {
            const isActive = sub.id === cat.id
            return (
              <Link
                key={sub.id}
                href={`/kategori/${sub.slug}`}
                className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                style={
                  isActive
                    ? { backgroundColor: `${sub.color}25`, color: sub.color, borderColor: `${sub.color}50` }
                    : { borderColor: 'rgb(var(--color-border))', color: 'rgb(var(--color-muted))' }
                }
              >
                {sub.name}
              </Link>
            )
          })}
        </div>
      )}

      {/* Borsa kategorisinde canlı piyasa verileri */}
      {cat.id === 'borsa' && (
        <>
          <BorsaWidget />
          <div className="mb-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
            <span className="text-xs font-semibold text-[rgb(var(--color-muted))]">Borsa Haberleri</span>
            <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
          </div>
        </>
      )}

      {/* News feed — initialPosts varsa skeleton göstermeden anında yükler */}
      <Suspense
        fallback={
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <TimelineItemSkeleton key={i} />
            ))}
          </div>
        }
      >
        <CategoryFeed categoryId={cat.id} initialPosts={initialPosts} />
      </Suspense>
    </div>
  )
}
