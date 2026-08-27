import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import {
  isPublisherPlatformEnabled,
  isPublisherProfileComposerEnabled,
  isProfileAdSlotsEnabled,
  isPublisherAdPublicListingEnabled,
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
  if (!isPublisherPlatformEnabled()) {
    return { title: 'Sayfa bulunamadı', robots: { index: false, follow: false } }
  }
  const slug = decodeSlug((await params).slug)
  if (!hasDatabaseUrl()) {
    return { title: slug, robots: { index: false, follow: false } }
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
  if (!isPublisherPlatformEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()

  const slug = decodeSlug((await params).slug)
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound()

  const publisher = await publisherService.getPublicPublisherBySlug(slug)
  if (!publisher) notFound()

  const fullRecord = await publisherService.getPublisherBySlug(slug)
  const articlePage = fullRecord
    ? await publisherService.getPublisherArticles(fullRecord.id, 24)
    : { items: [], nextCursor: null }

  const publishedLayout =
    fullRecord && isPublisherProfileComposerEnabled()
      ? await publisherLayoutService.getPublishedLayoutForPublic(fullRecord.id)
      : null

  let adInventoryById: Map<string, import('@/types/publisherAdInventory').PublisherAdInventoryRecord> | undefined
  if (
    publishedLayout &&
    isProfileAdSlotsEnabled() &&
    isPublisherAdPublicListingEnabled() &&
    fullRecord
  ) {
    try {
      const { publisherAdInventoryService } = await import(
        '@/services/publisher/publisherAdInventoryService'
      )
      const listed = await publisherAdInventoryService.listPublicSellable(fullRecord.id)
      adInventoryById = new Map(listed.map((i) => [i.id, i]))
    } catch {
      adInventoryById = undefined
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
      <PublisherProfileClient
        publisher={publisher}
        articles={articlePage.items}
      />
    </>
  )
}
