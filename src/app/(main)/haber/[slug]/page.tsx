import { cache } from 'react'
import type { Metadata } from 'next'
import { permanentRedirect, notFound } from 'next/navigation'
import { ArticleCopyGuard } from '@/components/news/ArticleCopyGuard'
import { ArticlePageChrome } from '@/components/news/ArticlePageChrome'
import { NewsArticleStatic } from '@/components/news/NewsArticleStatic'
import { NewsArticleInteractive } from '@/components/news/NewsArticleInteractive'
import {
  buildNewsArticleJsonLd,
  buildNewsBreadcrumbJsonLd,
  buildVideoObjectJsonLd,
  buildPostMetadata,
} from '@/lib/seo'
import { getNewsBySlug, getSuggestedPostsServer } from '@/services/newsService.server'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import {
  canResolveArticleDetail,
  classifyPublicRead,
  publicReadMetaFromPost,
  robotsForPublicReadClass,
  shouldEmitSelfCanonical,
} from '@/services/editorial/publicReadPolicy'
import { ROUTES } from '@/constants/routes'
import { getLcpPreload } from '@/lib/lcpImage'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { getArticleSeoContext } from '@/services/seo/articleSeoContext'
import { hasDatabaseUrl } from '@/db'
import {
  isArticleAdSlotsEnabled,
} from '@/lib/publisher/adInventoryFlags'
import { publisherService } from '@/services/publisher/publisherService'
import { publisherAdInventoryService } from '@/services/publisher/publisherAdInventoryService'

// ISR: Vercel CDN caches rendered news pages for 60s (Pro edge cache)
export const revalidate = 60

// Deduplicate: generateMetadata + page both need the post — fetch once per request
const getCachedNews = cache((slug: string) => getNewsBySlug(slug))

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params
  let slug = rawSlug
  try {
    slug = decodeURIComponent(rawSlug)
  } catch {}

  try {
    const post = await getCachedNews(slug)
    if (!post) {
      return {
        title: 'Haber bulunamadı',
        description: 'Aradığınız içerik bulunamadı veya kaldırılmış olabilir.',
        robots: { index: false, follow: false },
      }
    }
    if (!isPubliclyVisibleStatus(post.status)) {
      return {
        title: 'Haber bulunamadı',
        description: 'Aradığınız içerik bulunamadı veya kaldırılmış olabilir.',
        robots: { index: false, follow: false },
      }
    }
    const readClass = classifyPublicRead(publicReadMetaFromPost(post))
    if (!canResolveArticleDetail(readClass)) {
      return {
        title: 'Haber bulunamadı',
        description: 'Aradığınız içerik bulunamadı veya kaldırılmış olabilir.',
        robots: { index: false, follow: false },
      }
    }
    // P18.3: LEGACY_QUARANTINED stays readable with noindex,follow + self-canonical.
    return buildPostMetadata(post, {
      robotsOverride: robotsForPublicReadClass(readClass),
      omitCanonical: !shouldEmitSelfCanonical(readClass),
    })
  } catch {
    return {
      title: 'Haber Detayı',
      description: 'NaHaber haber detayı',
    }
  }
}

export default async function NewsDetailPage({ params }: PageProps) {
  const { slug: rawSlug } = await params
  let slug = rawSlug
  try {
    slug = decodeURIComponent(rawSlug)
  } catch {}

  let post = null

  try {
    post = await getCachedNews(slug)
  } catch {
    // Client fallback
  }

  if (!post) {
    notFound()
  }

  // Never render draft/pending articles on the public detail page. `getNewsBySlug`
  // fetches by slug/id without a status filter, so an in-moderation article could
  // otherwise be viewed directly (and would still be absent from category lists —
  // a confusing mismatch). Treat non-public statuses as not found.
  if (!isPubliclyVisibleStatus(post.status)) {
    notFound()
  }

  // P18.3 read boundary — NOT_PUBLIC blocked; LEGACY_QUARANTINED remains readable.
  const readClass = classifyPublicRead(publicReadMetaFromPost(post))
  if (!canResolveArticleDetail(readClass)) {
    notFound()
  }

  if (post.slug && post.slug !== slug && post.slug !== rawSlug && post.slug !== post.id) {
    permanentRedirect(ROUTES.NEWS_DETAIL(post.slug))
  }

  const jsonLd = buildNewsArticleJsonLd(post)
  const breadcrumbJsonLd = buildNewsBreadcrumbJsonLd(post)
  const videoJsonLd = buildVideoObjectJsonLd(post)

  const tenant = await getActiveTenant()
  const hostCitySlug = tenant ? null : await getCitySlugFromHeaders()
  const citySlug = tenant?.provinceSlug ?? hostCitySlug

  const relatedPosts = await getSuggestedPostsServer(post.id, {
    categoryId: post.categoryId ?? 'gundem',
    limit: 4,
    ...(citySlug ? { citySlug, tags: post.tags } : {}),
  })

  const seoContext = await getArticleSeoContext(post)

  let adSlots: { before: React.ReactNode; mid: React.ReactNode; after: React.ReactNode } | null =
    null
  let prerollAd: import('@/types/publisherManagedAds').ResolvedPublisherAd | null = null
  if (isArticleAdSlotsEnabled() && hasDatabaseUrl() && seoContext.publisher?.slug) {
    try {
      const pub = await publisherService.getPublisherBySlug(seoContext.publisher.slug)
      if (pub) {
        const inventory = await publisherAdInventoryService.getArticlePlacements(pub.id)
        const { buildArticleAdSlotViews } = await import('@/lib/publisher/articleAdPlacements')
        const {
          isPublisherSelfManagedAdsEnabled,
          isPublisherAdServingEnabled,
          isPublisherVideoPrerollEnabled,
        } = await import('@/lib/publisher/selfManagedAdFlags')
        const blockCount = post.bodyBlocks?.length ?? 0

        let resolvedByInventoryId: Map<
          string,
          import('@/types/publisherManagedAds').ResolvedPublisherAd | null
        > | undefined

        if (isPublisherSelfManagedAdsEnabled() && isPublisherAdServingEnabled()) {
          const { publisherManagedAdsService } = await import(
            '@/services/publisher/publisherManagedAdsService'
          )
          resolvedByInventoryId = new Map()
          await Promise.all(
            inventory.map(async (inv) => {
              const resolved = await publisherManagedAdsService.resolveActivePublisherAd(inv.id)
              resolvedByInventoryId!.set(inv.id, resolved)
            })
          )

          if (isPublisherVideoPrerollEnabled()) {
            const prerollInv = inventory.find((i) => i.placementScope === 'VIDEO_PRE_ROLL')
            if (prerollInv) {
              prerollAd = resolvedByInventoryId.get(prerollInv.id) ?? null
            }
          }
        }

        adSlots = buildArticleAdSlotViews(inventory, {
          publisherSlug: seoContext.publisher.slug,
          blockCount,
          resolvedByInventoryId,
        })
      }
    } catch {
      adSlots = null
    }
  }

  const heroImage = post.coverImageUrl?.trim() || null
  const lcpPreload = heroImage ? getLcpPreload(heroImage) : null

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {videoJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }}
        />
      )}
      <ArticleCopyGuard />
      <ArticlePageChrome />
      <NewsArticleStatic
        post={post}
        relatedPosts={relatedPosts}
        seoContext={seoContext}
        adSlots={adSlots}
        prerollAd={
          prerollAd
            ? {
                adId: prerollAd.ad.id,
                creativeId: prerollAd.creative.id,
                creativeType: prerollAd.creative.creativeType,
                mediaUrl: prerollAd.creative.mediaUrl,
                thumbnailUrl: prerollAd.creative.thumbnailUrl,
                headline: prerollAd.creative.headline,
                body: prerollAd.creative.body,
                altText: prerollAd.creative.altText,
                advertiserName: prerollAd.ad.advertiserName,
                clickHref: prerollAd.clickHref,
              }
            : null
        }
      />
      <NewsArticleInteractive post={post} citySlug={citySlug} />
    </>
  )
}
