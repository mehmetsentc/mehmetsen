import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CategoryFeed } from '@/components/feed/CategoryFeed'
import { WorldCupStrip } from '@/components/sports/WorldCupStrip'
import { MatchResults } from '@/components/sports/MatchResults'
import { SuperLigTable } from '@/components/sports/SuperLigTable'
import { TransferStrip } from '@/components/sports/TransferStrip'
import { getSubcategories, getCategoryFamily } from '@/constants/config'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { TimelinePost } from '@/types/post'

const SPOR_SUBCATEGORIES = getSubcategories('spor')

export const revalidate = 60

/**
 * Server-side prefetch — spor + alt branşların ilk 20 haberi.
 * /kategori/[id]/page.tsx'taki prefetchCategoryPosts ile aynı şekil:
 * SSR HTML içinde haber linkleri olduğundan SEO + crawler her ikisi
 * de doğru görür. (Bug fix: önceden bu prefetch yoktu, spor sayfası
 * Googlebot için boş görünüyordu.)
 */
async function prefetchSporPosts(): Promise<TimelinePost[]> {
  try {
    const db = getAdminFirestore()
    const family = getCategoryFamily('spor')
    const baseQ = db.collection(Collections.NEWS).where('status', '==', 'published')
    const snap = await (
      family.length > 1
        ? baseQ.where('categoryId', 'in', family)
        : baseQ.where('categoryId', '==', 'spor')
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
      if (typeof v === 'string') {
        const n = Date.parse(v)
        return Number.isNaN(n) ? null : n
      }
      return null
    }

    return snap.docs.map((doc) => {
      const d = doc.data()
      const image =
        d.coverImageUrl ?? d.thumbnail ?? d.imageUrl ?? d.featuredImage ?? null
      const videoUrl = d.videoUrl ?? ''
      const mediaItems = videoUrl
        ? [{ type: 'video' as const, url: videoUrl, thumbnailUrl: image, caption: null }]
        : image
          ? [{ type: 'image' as const, url: image, thumbnailUrl: image, caption: null }]
          : []
      return {
        id: doc.id,
        authorUsername: d.authorUsername ?? '',
        authorDisplayName: d.authorDisplayName ?? '',
        authorId: d.authorId ?? '',
        title: d.title ?? '',
        spot: d.spot ?? d.summary ?? '',
        content: d.content ?? '',
        summary: d.summary ?? d.spot ?? '',
        categoryId: d.categoryId ?? '',
        citySlug: d.citySlug ?? '',
        city: d.city ?? null,
        cityName: d.cityName ?? '',
        coverImageUrl: image,
        mediaItems,
        url: d.url ?? ROUTES.NEWS_DETAIL(d.slug?.trim() || doc.id),
        slug: d.slug ?? doc.id,
        publishedAt: ts(d.publishedAt) ?? ts(d.createdAt) ?? Date.now(),
        createdAt: ts(d.createdAt) ?? Date.now(),
        updatedAt: ts(d.updatedAt) ?? null,
        status: d.status ?? 'published',
        visibility: d.visibility ?? 'public',
        postType: d.postType ?? (videoUrl ? 'video' : 'news'),
        source: d.source ?? '',
        author: d.author ?? null,
        isBreaking: d.isBreaking ?? false,
        hasVideo: d.hasVideo ?? false,
        isVideo: d.isVideo ?? false,
        tags: d.tags ?? [],
        priorityScore: d.priorityScore ?? null,
        viewsCount: d.viewsCount ?? 0,
        likesCount: d.likesCount ?? 0,
        commentsCount: d.commentsCount ?? d.commentCount ?? 0,
        savesCount: d.savesCount ?? 0,
        sharesCount: d.sharesCount ?? 0,
      } as unknown as TimelinePost
    })
  } catch {
    return [] // prefetch başarısız → client normal akışa devam eder
  }
}

export const metadata: Metadata = {
  title: 'Spor Haberleri',
  description: 'NaHaber\'de son dakika spor haberleri, maç sonuçları ve Dünya Kupası gelişmeleri',
  alternates: {
    canonical: `${getSiteUrl()}${ROUTES.SPOR}`,
  },
  openGraph: {
    title: 'Spor Haberleri | NaHaber',
    description: 'Son dakika spor haberleri, maç sonuçları ve Dünya Kupası gelişmeleri',
  },
}

export default async function SporPage() {
  // SSR'da ilk 20 haberi çek → Googlebot ve curl-tabanlı crawler'lar
  // sayfayı boş görmesin, hidrasyon öncesi de okunsun.
  const initialPosts = await prefetchSporPosts()

  return (
    <div className="w-full">
      {/* Category header */}
      <div
        className="mb-3 flex items-center gap-3 rounded-2xl px-4 py-2.5"
        style={{ backgroundColor: '#10B98118', borderLeft: '4px solid #10B981' }}
      >
        <div>
          <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))]">
            ⚽ Spor
          </h1>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">
            Son dakika spor haberleri ve maç sonuçları
          </p>
        </div>
      </div>




      {/* Spor alt kategorileri */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/kategori/spor"
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: '#10B98120', color: '#10B981', border: '1px solid #10B98140' }}
        >
          Tümü
        </Link>
        {SPOR_SUBCATEGORIES.map((sub) => (
          <Link
            key={sub.id}
            href={`/kategori/${sub.slug}`}
            className="rounded-full border border-[rgb(var(--color-border))] px-3 py-1 text-xs font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors"
          >
            {sub.name}
          </Link>
        ))}
      </div>

      {/* 🏆 Dünya Kupası yatay kaydırma şeridi */}
      <WorldCupStrip />

      {/* ⚽ Maç Sonuçları */}
      <MatchResults />

      {/* 🇹🇷 Süper Lig Puan Tablosu */}
      <SuperLigTable />

      {/* 💸 Son Transferler */}
      <TransferStrip />

      {/* Divider */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--color-muted))]">
          Tüm Haberler
        </span>
        <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <TimelineItemSkeleton key={i} />
            ))}
          </div>
        }
      >
        <CategoryFeed categoryId="spor" initialPosts={initialPosts} />
      </Suspense>
    </div>
  )
}
