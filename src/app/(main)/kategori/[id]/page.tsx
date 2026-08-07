import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { DEFAULT_CATEGORIES, getSubcategories, getCategoryFamily, getParentCategory, type CategoryDef } from '@/constants/config'
import { CategoryPageClient } from '@/components/category/CategoryPageClient'
import { CategoryStructuredData } from '@/components/category/CategoryStructuredData'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl, buildCategoryOgUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { TimelinePost } from '@/types/post'
import { getWorldCup2026Data } from '@/services/sportsApi/worldCup2026'
import { getLcpPreload } from '@/lib/lcpImage'
import { categoryPostImage } from '@/components/home/desktop/categoryPostUtils'

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

const CATEGORY_SEO_TITLES: Record<string, string> = {
  'yerel-haber': 'Şehrinizden Yerel Haberler',
  'son-dakika': 'Son Dakika Haberleri',
  'spor': 'Spor Haberleri',
  'gundem': 'Gündem Haberleri',
  'dunya': 'Dünya Haberleri',
  'ekonomi': 'Ekonomi Haberleri',
  'teknoloji': 'Teknoloji Haberleri',
  'siyaset': 'Siyaset Haberleri',
  'saglik': 'Sağlık Haberleri',
  'bilim': 'Bilim Haberleri',
  'egitim': 'Eğitim Haberleri',
  'kultur': 'Kültür Sanat Haberleri',
  'magazin': 'Magazin Haberleri',
  'asayis': '3. Sayfa Haberleri',
  'cevre-iklim': 'Çevre ve İklim Haberleri',
  'tarih': 'Tarihte Bugün ve Tarih Haberleri',
  'gastronomi': 'Gastronomi ve Yemek Haberleri',
  'otomobil': 'Otomobil ve Otomotiv Haberleri',
  'turizm': 'Turizm Haberleri',
  'gezi': 'Gezi Rehberi ve Seyahat Haberleri',
  'meteoroloji': 'Hava Durumu ve Meteoroloji Haberleri',
  'din-inanc': 'Din ve İnanç Haberleri',
  'oyun-espor': 'Oyun ve Espor Haberleri',
  'kibris-haberleri': 'Kıbrıs Haberleri',
  'yasam': 'Yaşam Haberleri',
}

const CATEGORY_SEO_DESCRIPTIONS: Record<string, string> = {
  'gundem': 'Türkiye ve dünya gündemine dair son dakika haberler, sıcak gelişmeler ve analiz.',
  'spor': 'Son dakika spor haberleri, Süper Lig, şampiyonlar ligi, transfer ve maç sonuçları.',
  'ekonomi': 'Ekonomi haberleri, borsa verileri, döviz kurları, finans ve piyasa analizleri.',
  'teknoloji': 'Teknoloji dünyasından son haberler, yeni ürün incelemeleri ve dijital trendler.',
  'siyaset': 'İç ve dış siyaset haberleri, meclis kararları ve siyasi gelişmeler.',
  'dunya': 'Dünya haberleri, uluslararası gelişmeler ve küresel gündem.',
  'saglik': 'Sağlık haberleri, tıbbi gelişmeler, sağlıklı yaşam önerileri ve uzman görüşleri.',
  'bilim': 'Bilim ve araştırma haberleri, uzay keşifleri ve teknolojik buluşlar.',
  'egitim': 'Eğitim haberleri, sınav sonuçları, YKS-KPSS güncellemeleri ve eğitim politikaları.',
  'kultur': 'Kültür sanat haberleri, sinema, tiyatro, müzik, festival ve sergi haberleri.',
  'magazin': 'Magazin haberleri, ünlülerin hayatı, moda trendleri ve eğlence dünyası.',
  'asayis': 'Türkiye geneli 3. sayfa haberleri, adli olaylar ve asayiş gelişmeleri.',
  'cevre-iklim': 'Çevre ve iklim haberleri, sürdürülebilirlik, doğa koruma ve ekoloji.',
  'tarih': 'Tarihte bugün, tarihi olaylar, arkeoloji keşifleri ve tarih yazıları.',
  'yasam': 'Yaşam, moda, dekorasyon, ilişkiler ve günlük hayata dair haberler.',
  'turizm': 'Turizm haberleri, tatil destinasyonları, otel incelemeleri ve seyahat rehberleri.',
  'gezi': 'Gezi rehberleri, seyahat rotaları ve keşfedilecek yerler hakkında bilgiler.',
  'gastronomi': 'Yemek tarifleri, restoran incelemeleri, gastronomi trendleri ve mutfak kültürü.',
  'otomobil': 'Otomobil haberleri, yeni model incelemeleri, otomotiv sektörü ve trafik güncellemeleri.',
  'meteoroloji': 'Hava durumu tahminleri, meteorolojik uyarılar ve iklim verileri.',
  'din-inanc': 'Din ve inanç haberleri, Diyanet açıklamaları, dini günler ve manevi yaşam.',
  'oyun-espor': 'Oyun ve espor haberleri, turnuva sonuçları, yeni çıkan oyunlar ve incelemeler.',
  'kibris-haberleri': 'Kuzey Kıbrıs ve Kıbrıs adasından son haberler, siyaset ve toplum.',
  'son-dakika': 'Son dakika haberleri — Türkiye ve dünyada şu an olan en önemli gelişmeler.',
  'yerel-haber': '81 ilden yerel haberler, şehir gündemleri ve bölgesel gelişmeler.',
}

function getCategoryPageTitle(cat: CategoryDef): string {
  if (CATEGORY_SEO_TITLES[cat.id]) return CATEGORY_SEO_TITLES[cat.id]
  const parent = getParentCategory(cat.id)
  if (parent) return `${cat.name} Haberleri — ${parent.name}`
  return `${cat.name} Haberleri`
}

function getCategoryDescription(cat: CategoryDef, siteName: string): string {
  if (CATEGORY_SEO_DESCRIPTIONS[cat.id]) return CATEGORY_SEO_DESCRIPTIONS[cat.id]
  const parent = getParentCategory(cat.id)
  if (parent) {
    return `${cat.name} haberleri, ${parent.name} kategorisinde son dakika gelişmeler ve güncel içerikler — ${siteName}`
  }
  return `${cat.name} kategorisindeki son dakika haberler, güncel gelişmeler ve editoryal içerik — ${siteName}`
}

function getCategoryKeywords(cat: CategoryDef, siteName: string): string[] {
  const base = [cat.name, `${cat.name} haberleri`, `${cat.name} son dakika`, siteName, 'Türkiye haberleri']
  const parent = getParentCategory(cat.id)
  if (parent) {
    base.push(parent.name, `${parent.name} haberleri`)
  }
  const subs = getSubcategories(cat.id)
  for (const sub of subs.slice(0, 5)) {
    base.push(sub.name)
  }
  return base
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const cat = getCategoryMeta(id)
  if (!cat) return { title: 'Kategori', robots: { index: false, follow: false } }

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const pageTitle = getCategoryPageTitle(cat)
  const description = getCategoryDescription(cat, siteName)
  const canonicalUrl = `${siteUrl}${ROUTES.CATEGORY(cat.slug ?? cat.id)}`
  const ogImage = buildCategoryOgUrl(pageTitle, cat.name)
  const posts = await prefetchCategoryPosts(cat.id)
  const thinCategory = posts.length < 3
  const keywords = getCategoryKeywords(cat, siteName)

  return {
    title: pageTitle,
    description,
    keywords,
    robots: thinCategory
      ? { index: false, follow: true }
      : { index: true, follow: true },
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${pageTitle} | ${siteName}`,
      description,
      url: canonicalUrl,
      type: 'website',
      locale: 'tr_TR',
      siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: pageTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: `${pageTitle} | ${siteName}`,
      description,
      images: [{ url: ogImage, alt: pageTitle }],
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

  const lcpImage = initialPosts.find((p) => categoryPostImage(p).length > 10)
  const lcpUrl = lcpImage ? categoryPostImage(lcpImage) : null
  const lcpPreload = lcpUrl ? getLcpPreload(lcpUrl) : null

  return (
    <>
      {lcpPreload ? (
        <link
          rel="preload"
          as="image"
          href={lcpPreload.href}
          imageSrcSet={lcpPreload.imagesrcset}
          imageSizes={lcpPreload.imagesizes}
          fetchPriority="high"
        />
      ) : null}
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
