import 'server-only'

import { URL } from 'node:url'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import {
  evaluateArticleSeo,
  evaluateCategorySeo,
  evaluateEventSeo,
  evaluatePublisherSeo,
  evaluateTopicSeo,
  evaluateUserProfileSeo,
  evaluateAdminSeo,
  evaluatePreviewSeo,
  evaluateDraftSeo,
  type SeoPageKind,
} from '@/lib/seo/seoEligibility'
import { articleCanonicalUrl, eventCanonicalUrl, publisherCanonicalUrl, topicCanonicalUrl, categoryCanonicalUrl } from '@/lib/seo/canonical'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import { eventPageService } from '@/services/seo/eventPageService'
import { publisherService } from '@/services/publisher/publisherService'
import { getNewsBySlug } from '@/services/newsService.server'
import { parseTagSlug } from '@/lib/tags'
import { DEFAULT_CATEGORIES } from '@/constants/config'

export interface SeoDebugResult {
  url: string
  pageKind: SeoPageKind
  canonical: string | null
  indexable: boolean
  noindexReason: string
  structuredDataType: string | null
  sitemapIncluded: boolean
  robots: { index: boolean; follow: boolean }
}

function resolvePath(pathname: string): { kind: SeoPageKind; slug?: string } {
  if (pathname.startsWith('/admin')) return { kind: 'admin' }
  if (pathname.startsWith('/preview') || pathname.includes('/preview/')) return { kind: 'preview' }
  if (pathname.startsWith('/u/')) return { kind: 'user_profile', slug: pathname.split('/')[2] }
  if (pathname.startsWith('/haber/')) return { kind: 'article', slug: pathname.split('/')[2] }
  if (pathname.startsWith('/publisher/')) return { kind: 'publisher', slug: pathname.split('/')[2] }
  if (pathname.startsWith('/olay/')) return { kind: 'event', slug: pathname.split('/')[2] }
  if (pathname.startsWith('/etiket/') || pathname.startsWith('/konu/')) {
    return { kind: 'topic', slug: pathname.split('/')[2] }
  }
  if (pathname.startsWith('/kategori/')) return { kind: 'category', slug: pathname.split('/')[2] }
  if (pathname.startsWith('/yerel/')) return { kind: 'city', slug: pathname.split('/')[2] }
  if (pathname.startsWith('/post/')) return { kind: 'draft', slug: pathname.split('/')[2] }
  return { kind: 'article' }
}

export async function debugSeoUrl(rawUrl: string): Promise<SeoDebugResult> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl, getSiteUrl())
  } catch {
    return {
      url: rawUrl,
      pageKind: 'article',
      canonical: null,
      indexable: false,
      noindexReason: 'missing_content',
      structuredDataType: null,
      sitemapIncluded: false,
      robots: { index: false, follow: false },
    }
  }

  const { kind, slug } = resolvePath(parsed.pathname)
  const decodedSlug = slug ? decodeURIComponent(slug) : undefined

  if (kind === 'admin') {
    const r = evaluateAdminSeo()
    return {
      url: parsed.href,
      pageKind: kind,
      canonical: null,
      indexable: r.indexable,
      noindexReason: r.noindexReason,
      structuredDataType: null,
      sitemapIncluded: false,
      robots: { index: r.indexable, follow: r.follow },
    }
  }

  if (kind === 'preview') {
    const r = evaluatePreviewSeo()
    return {
      url: parsed.href,
      pageKind: kind,
      canonical: null,
      indexable: false,
      noindexReason: r.noindexReason,
      structuredDataType: null,
      sitemapIncluded: false,
      robots: { index: false, follow: false },
    }
  }

  if (kind === 'user_profile') {
    const r = evaluateUserProfileSeo()
    return {
      url: parsed.href,
      pageKind: kind,
      canonical: parsed.href,
      indexable: r.indexable,
      noindexReason: r.noindexReason,
      structuredDataType: null,
      sitemapIncluded: false,
      robots: { index: false, follow: r.follow },
    }
  }

  if (kind === 'draft') {
    const r = evaluateDraftSeo()
    return {
      url: parsed.href,
      pageKind: kind,
      canonical: null,
      indexable: false,
      noindexReason: r.noindexReason,
      structuredDataType: null,
      sitemapIncluded: false,
      robots: { index: false, follow: false },
    }
  }

  if (kind === 'article' && decodedSlug) {
    const post = await getNewsBySlug(decodedSlug).catch(() => null)
    const r = evaluateArticleSeo(post)
    const canonical = post ? articleCanonicalUrl(post) : null
    return {
      url: parsed.href,
      pageKind: 'article',
      canonical,
      indexable: r.indexable,
      noindexReason: r.noindexReason,
      structuredDataType: 'NewsArticle',
      sitemapIncluded: r.indexable,
      robots: { index: r.indexable, follow: r.follow },
    }
  }

  if (kind === 'publisher' && decodedSlug) {
    const publisher = await publisherService.getPublicPublisherBySlug(decodedSlug).catch(() => null)
    const r = evaluatePublisherSeo(publisher)
    return {
      url: parsed.href,
      pageKind: 'publisher',
      canonical: publisher ? publisherCanonicalUrl(publisher.slug) : null,
      indexable: r.indexable,
      noindexReason: r.noindexReason,
      structuredDataType: 'NewsMediaOrganization',
      sitemapIncluded: r.indexable,
      robots: { index: r.indexable, follow: r.follow },
    }
  }

  if (kind === 'event' && decodedSlug && isEventPagesEnabled()) {
    const event = await eventPageService.getBySlug(decodedSlug).catch(() => null)
    const r = evaluateEventSeo(
      event
        ? {
            canonicalTitle: event.canonicalTitle,
            sourceCount: event.uniqueSourceCount,
            clusterConfidence: event.clusterConfidence,
            eventStatus: event.eventStatus,
            aiEligibility: event.aiEligibility,
          }
        : null
    )
    return {
      url: parsed.href,
      pageKind: 'event',
      canonical: event ? eventCanonicalUrl(event.slug) : null,
      indexable: r.indexable,
      noindexReason: r.noindexReason,
      structuredDataType: 'NewsArticle',
      sitemapIncluded: r.indexable,
      robots: { index: r.indexable, follow: r.follow },
    }
  }

  if (kind === 'topic' && decodedSlug) {
    const tag = parseTagSlug(decodedSlug)
    const r = evaluateTopicSeo(tag, 0)
    return {
      url: parsed.href,
      pageKind: 'topic',
      canonical: topicCanonicalUrl(tag),
      indexable: r.indexable,
      noindexReason: r.noindexReason,
      structuredDataType: 'CollectionPage',
      sitemapIncluded: r.indexable,
      robots: { index: r.indexable, follow: r.follow },
    }
  }

  if (kind === 'category' && decodedSlug) {
    const cat = DEFAULT_CATEGORIES.find((c) => c.slug === decodedSlug || c.id === decodedSlug)
    const r = evaluateCategorySeo(decodedSlug, cat ? 10 : 0)
    return {
      url: parsed.href,
      pageKind: 'category',
      canonical: cat ? categoryCanonicalUrl(cat.slug ?? cat.id) : `${getSiteUrl()}${ROUTES.CATEGORY(decodedSlug)}`,
      indexable: r.indexable,
      noindexReason: r.noindexReason,
      structuredDataType: 'CollectionPage',
      sitemapIncluded: r.indexable,
      robots: { index: r.indexable, follow: r.follow },
    }
  }

  return {
    url: parsed.href,
    pageKind: kind,
    canonical: parsed.href,
    indexable: true,
    noindexReason: 'none',
    structuredDataType: 'WebPage',
    sitemapIncluded: false,
    robots: { index: true, follow: true },
  }
}
