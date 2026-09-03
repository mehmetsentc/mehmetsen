import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { hasDatabaseUrl } from '@/db'
import {
  isPublisherPlatformEnabled,
  isPublisherProfileComposerEnabled,
  isProfileAdSlotsEnabled,
} from '@/lib/publisher/featureFlag'
import {
  evaluatePublisherSeo,
  robotsFromEligibility,
} from '@/lib/seo/seoEligibility'
import { publisherMetaDescription, publisherMetaTitle } from '@/lib/seo/metaTemplates'
import { publisherCanonicalUrl } from '@/lib/seo/canonical'
import { buildPublisherOrganizationJsonLd } from '@/lib/seo/structuredData'
import { recordSeoIndexable } from '@/lib/seo/observability'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { isPublisherProfileSlug } from '@/lib/publisher/profileSlug'
import { publisherService } from '@/services/publisher/publisherService'
import { publisherLayoutService } from '@/services/publisher/publisherLayoutService'
import { PublisherLayoutRenderer } from '@/components/publisher/PublisherLayoutRenderer'
import { PublisherProfileClient } from '@/components/publisher/PublisherProfileClient'

export const revalidate = 300

interface Props {
  params: Promise<{ slug: string }>
}

function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeSlug((await params).slug)
  if (!hasDatabaseUrl()) {
    return { title: slug, robots: { index: false, follow: false } }
  }
  if (!isPublisherPlatformEnabled()) {
    const { publisherRepository } = await import('@/services/publisher/publisherRepository')
    const { isPlatformEffectiveForPublisher } = await import('@/lib/publisher/effectiveFlags')
    const row = await publisherRepository.findBySlug(slug)
    if (!row || !(await isPlatformEffectiveForPublisher(row.id))) {
      return { title: 'Sayfa bulunamadı', robots: { index: false, follow: false } }
    }
  }
  const publisher = await publisherService.getPublicPublisherBySlug(slug)
  if (!publisher) return { title: 'Yayın bulunamadı', robots: { index: false, follow: false } }

  const eligibility = evaluatePublisherSeo(publisher, 1)
  recordSeoIndexable('publisher', eligibility.indexable, eligibility.noindexReason)
  const robots = robotsFromEligibility(eligibility)

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const title = publisherMetaTitle(publisher.displayName)
  const description = publisherMetaDescription(publisher.displayName, publisher.description)
  const canonical = publisherCanonicalUrl(publisher.slug)

  return {
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: canonical,
      type: 'profile',
      locale: 'tr_TR',
      siteName,
      ...(publisher.logoUrl ? { images: [{ url: publisher.logoUrl }] } : {}),
    },
  }
}

export default async function PublisherProfilePage({ params }: Props) {
  if (!hasDatabaseUrl()) notFound()

  const slug = decodeSlug((await params).slug)
  if (!slug || !isPublisherProfileSlug(slug)) notFound()

  // Global OFF still allows allowlisted publishers (P11 controlled rollout).
  if (!isPublisherPlatformEnabled()) {
    const { publisherRepository } = await import('@/services/publisher/publisherRepository')
    const { isPlatformEffectiveForPublisher } = await import('@/lib/publisher/effectiveFlags')
    const row = await publisherRepository.findBySlug(slug)
    if (!row || !(await isPlatformEffectiveForPublisher(row.id))) notFound()
  }

  const publisher = await publisherService.getPublicPublisherBySlug(slug)
  if (!publisher) notFound()

  const fullRecord = await publisherService.getPublisherBySlug(slug)
  const categoryParam = null // category filtering is client + API; SSR loads Tümü
  const articlePage = fullRecord
    ? await publisherService.getPublisherArticles(fullRecord.id, 30, null, {
        categoryId: categoryParam,
      })
    : { items: [], nextCursor: null }

  const eligibleCount = fullRecord
    ? await publisherService.countPublisherPublicArticles(fullRecord.id).catch(() => articlePage.items.length)
    : 0


  const publishedLayout = fullRecord
    ? await (async () => {
        const { isFeatureEnabledForPublisher } = await import('@/lib/publisher/effectiveFlags')
        const composerOn =
          isPublisherProfileComposerEnabled() ||
          (await isFeatureEnabledForPublisher(fullRecord.id, 'PROFILE_COMPOSER'))
        if (!composerOn) return null
        return publisherLayoutService.getPublishedLayoutForPublic(fullRecord.id)
      })()
    : null

  let adInventoryById: Map<string, import('@/types/publisherAdInventory').PublisherAdInventoryRecord> | undefined
  let resolvedAdsByInventoryId:
    | Map<string, import('@/types/publisherManagedAds').ResolvedPublisherAd>
    | undefined
  if (publishedLayout && fullRecord) {
    const { isFeatureEnabledForPublisher } = await import('@/lib/publisher/effectiveFlags')
    const slotsOn =
      isProfileAdSlotsEnabled() ||
      (await isFeatureEnabledForPublisher(fullRecord.id, 'PROFILE_AD_SLOTS'))
    if (slotsOn) {
    try {
      const { publisherAdInventoryService } = await import(
        '@/services/publisher/publisherAdInventoryService'
      )

      // Load all active inventory attached to layout slots (not only publicly listed)
      const allInv = await publisherAdInventoryService.listPublicSellable(fullRecord.id)
      // Also include NOT_FOR_SALE slots that may have self-managed ads — fetch via repo for layout items
      const layoutInventoryIds = new Set<string>()
      for (const resolvedSection of publishedLayout.sections) {
        for (const item of resolvedSection.items) {
          if (item.itemType !== 'AD_SLOT') continue
          const id =
            item.contentId ||
            (typeof item.presentation?.inventoryId === 'string'
              ? item.presentation.inventoryId
              : null)
          if (id) layoutInventoryIds.add(id)
        }
      }

      const map = new Map(allInv.map((i) => [i.id, i]))
      if (layoutInventoryIds.size > 0) {
        const { publisherAdInventoryRepository } = await import(
          '@/services/publisher/publisherAdInventoryRepository'
        )
        await Promise.all(
          [...layoutInventoryIds].map(async (id) => {
            if (map.has(id)) return
            const row = await publisherAdInventoryRepository.findById(id)
            if (row && row.publisherId === fullRecord.id && row.status === 'ACTIVE') {
              map.set(id, row)
            }
          })
        )
      }
      adInventoryById = map

      // resolveActivePublisherAd already gates on allowlist + serving
      const { publisherManagedAdsService } = await import(
        '@/services/publisher/publisherManagedAdsService'
      )
      resolvedAdsByInventoryId = new Map()
      await Promise.all(
        [...map.keys()].map(async (invId) => {
          const resolved = await publisherManagedAdsService.resolveActivePublisherAd(invId)
          if (resolved) resolvedAdsByInventoryId!.set(invId, resolved)
        })
      )
    } catch {
      adInventoryById = undefined
      resolvedAdsByInventoryId = undefined
    }
    }
  }

  if (publishedLayout) {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(buildPublisherOrganizationJsonLd(publisher)),
          }}
        />
        <PublisherLayoutRenderer
          publisher={publisher}
          layout={publishedLayout}
          fallbackArticles={articlePage.items}
          adInventoryById={adInventoryById}
          resolvedAdsByInventoryId={resolvedAdsByInventoryId}
        />
      </>
    )
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildPublisherOrganizationJsonLd(publisher)),
        }}
      />
      <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-8 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>}>
        <PublisherProfileClient
          publisher={publisher}
          articles={articlePage.items}
          totalCount={Math.max(eligibleCount, articlePage.items.length)}
          nextCursor={articlePage.nextCursor}
        />
      </Suspense>
    </>
  )
}
