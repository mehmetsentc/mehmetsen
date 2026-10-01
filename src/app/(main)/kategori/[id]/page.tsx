import '@/styles/tokens/mobile-category.css'
import '@/styles/tokens/desktop-category-portal.css'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { DEFAULT_CATEGORIES, getSubcategories, getParentCategory, type CategoryDef } from '@/constants/config'
import { CategoryPageClient } from '@/components/category/CategoryPageClient'
import { CategoryStructuredData } from '@/components/category/CategoryStructuredData'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { getSiteUrl, buildCategoryOgUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { getThemedCategorySectionIds } from '@/constants/categorySections'
import {
  filterItemsWithPresence,
  filterThemedSectionIds,
  shouldHideEmptyScopedCategories,
} from '@/lib/scopedCategoryPresence'
import { prefetchCategoryPosts } from '@/services/categoryFirstPage.server'
import { getActiveScopedCategoryIds } from '@/services/scopedCategoryPresence.server'
import { getWorldCup2026Data } from '@/services/sportsApi/worldCup2026'
import { HOME_LCP_WIDTH, getLcpPreload } from '@/lib/lcpImage'
import { categoryPostImage } from '@/components/home/desktop/categoryPostUtils'

interface Props {
  params: Promise<{ id: string }>
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

// National only: city hosts are rewritten to /city-site/kategori (next.config), so
// this page must not read the host (any dynamic API drops it off the CDN).
export const revalidate = 300

export function generateStaticParams() {
  return []
}

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
  const headerCat = parentCat ?? cat
  const hideEmptyScoped = shouldHideEmptyScopedCategories(tabParent.id)
  const activeScopedIds = hideEmptyScoped
    ? await getActiveScopedCategoryIds(tabParent.id)
    : subcategories.map((sub) => sub.id)

  const visibleSubs = hideEmptyScoped
    ? filterItemsWithPresence(subcategories, activeScopedIds, [cat.id])
    : subcategories
  const showTabs = visibleSubs.length > 0

  const subTabs = visibleSubs.map((sub) => ({
    id: sub.id,
    slug: sub.slug,
    name: sub.name,
    color: sub.color,
    href: `/kategori/${sub.slug}`,
    active: sub.id === cat.id,
  }))

  const visibleSectionIds = hideEmptyScoped
    ? filterThemedSectionIds(
        getThemedCategorySectionIds(cat.id),
        activeScopedIds,
        { currentCategoryId: cat.id }
      )
    : undefined

  const initialPosts = await prefetchCategoryPosts(cat.id)
  const worldCupData = cat.id === 'dunya-kupasi-2026' ? await getWorldCup2026Data() : null

  const lcpImage = initialPosts.find((p) => categoryPostImage(p).length > 10)
  const lcpUrl = lcpImage ? categoryPostImage(lcpImage) : null
  const lcpPreload = lcpUrl ? getLcpPreload(lcpUrl, HOME_LCP_WIDTH) : null

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
          visibleSectionIds={visibleSectionIds}
          initialPosts={initialPosts}
          worldCupData={worldCupData}
        />
      </Suspense>
    </>
  )
}
