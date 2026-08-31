import type { Post, PostStatus } from '@/types/post'
import type { PublicPublisherRecord } from '@/types/publisher'
import { isPubliclyVisibleStatus } from '@/lib/postUtils'
import { isSeoDistributionV1Enabled } from '@/lib/seo/featureFlag'

export type SeoPageKind =
  | 'article'
  | 'publisher'
  | 'city'
  | 'district'
  | 'category'
  | 'topic'
  | 'event'
  | 'user_profile'
  | 'admin'
  | 'preview'
  | 'draft'

export type SeoNoindexReason =
  | 'empty_publisher'
  | 'suspended_publisher'
  | 'inactive_publisher'
  | 'internal_test_publisher'
  | 'thin_topic'
  | 'thin_category'
  | 'low_confidence_event'
  | 'draft'
  | 'admin'
  | 'preview'
  | 'unpublished'
  | 'user_profile'
  | 'feature_disabled'
  | 'missing_content'
  | 'none'

export interface SeoEligibilityResult {
  indexable: boolean
  noindexReason: SeoNoindexReason
  follow: boolean
}

const MIN_TOPIC_ARTICLES = 3
const MIN_CATEGORY_ARTICLES = 2
const MIN_EVENT_SOURCES = 2
const MIN_EVENT_CONFIDENCE = 0.55

function base(indexable: boolean, reason: SeoNoindexReason, follow = true): SeoEligibilityResult {
  return { indexable, noindexReason: reason, follow }
}

/** Article — always indexable when published & public (flag off must not break existing SEO). */
export function evaluateArticleSeo(post: Pick<Post, 'status' | 'title'> | null): SeoEligibilityResult {
  if (!post) return base(false, 'missing_content', false)
  if (!isPubliclyVisibleStatus(post.status as PostStatus)) return base(false, 'unpublished', false)
  if (!post.title?.trim()) return base(false, 'missing_content', false)
  return base(true, 'none')
}

export function evaluatePublisherSeo(
  publisher: (Pick<
    PublicPublisherRecord,
    'status' | 'isPubliclyVisible' | 'displayName'
  > & {
    publisherType?: PublicPublisherRecord['publisherType']
  }) | null,
  articleCount = 0
): SeoEligibilityResult {
  if (!publisher) return base(false, 'empty_publisher', false)
  if (publisher.publisherType === 'INTERNAL_TEST') {
    return base(false, 'internal_test_publisher', false)
  }
  if (publisher.status === 'SUSPENDED') return base(false, 'suspended_publisher', false)
  if (publisher.status === 'INACTIVE') return base(false, 'inactive_publisher', false)
  if (!publisher.isPubliclyVisible) return base(false, 'empty_publisher', false)
  if (isSeoDistributionV1Enabled() && articleCount === 0 && !publisher.displayName?.trim()) {
    return base(false, 'empty_publisher', false)
  }
  return base(true, 'none')
}

export function evaluateCitySeo(_citySlug: string, articleCount = 0): SeoEligibilityResult {
  if (isSeoDistributionV1Enabled() && articleCount < MIN_CATEGORY_ARTICLES) {
    return base(false, 'thin_category', true)
  }
  return base(true, 'none')
}

export function evaluateDistrictSeo(_districtSlug: string, articleCount = 0): SeoEligibilityResult {
  if (isSeoDistributionV1Enabled() && articleCount < MIN_CATEGORY_ARTICLES) {
    return base(false, 'thin_category', true)
  }
  return base(true, 'none')
}

export function evaluateCategorySeo(_categoryId: string, articleCount = 0): SeoEligibilityResult {
  if (isSeoDistributionV1Enabled() && articleCount < MIN_CATEGORY_ARTICLES) {
    return base(false, 'thin_category', true)
  }
  return base(true, 'none')
}

export function evaluateTopicSeo(_tagSlug: string, articleCount = 0): SeoEligibilityResult {
  if (articleCount < MIN_TOPIC_ARTICLES) return base(false, 'thin_topic', true)
  return base(true, 'none')
}

export interface EventSeoInput {
  canonicalTitle: string | null
  sourceCount: number
  clusterConfidence: number
  eventStatus?: string | null
  aiEligibility?: string | null
}

export function evaluateEventSeo(event: EventSeoInput | null): SeoEligibilityResult {
  if (!event) return base(false, 'missing_content', false)
  if (!event.canonicalTitle?.trim()) return base(false, 'missing_content', false)
  if (event.sourceCount < MIN_EVENT_SOURCES) return base(false, 'low_confidence_event', true)
  if (event.clusterConfidence < MIN_EVENT_CONFIDENCE) return base(false, 'low_confidence_event', true)
  if (event.eventStatus === 'CLOSED' && event.sourceCount < MIN_EVENT_SOURCES + 1) {
    return base(false, 'low_confidence_event', true)
  }
  const blocked = new Set(['REJECTED', 'SPAM', 'DUPLICATE'])
  if (event.aiEligibility && blocked.has(event.aiEligibility.toUpperCase())) {
    return base(false, 'low_confidence_event', true)
  }
  return base(true, 'none')
}

export function evaluateUserProfileSeo(): SeoEligibilityResult {
  return base(false, 'user_profile', true)
}

export function evaluateAdminSeo(): SeoEligibilityResult {
  return base(false, 'admin', false)
}

export function evaluatePreviewSeo(): SeoEligibilityResult {
  return base(false, 'preview', false)
}

export function evaluateDraftSeo(): SeoEligibilityResult {
  return base(false, 'draft', false)
}

export interface HeadingStructureResult {
  hasHeadings: boolean
  headingCount: number
}

const MIN_BODY_HEADINGS = 1

/**
 * Non-blocking QA signal: does the article body have real ## heading structure?
 *
 * Deliberately does NOT feed into evaluateArticleSeo()/indexability — flipping
 * indexable=false here would retroactively noindex thousands of already-published
 * historical articles that predate the heading-instruction fix. This is a
 * monitoring/reporting signal only (see seoMaintenanceWorker.ts), not a
 * publish/index gate.
 */
export function evaluateHeadingStructure(
  post: Pick<Post, 'content' | 'bodyBlocks'> | null
): HeadingStructureResult {
  if (!post) return { hasHeadings: false, headingCount: 0 }

  if (post.bodyBlocks?.length) {
    const headingCount = post.bodyBlocks.filter((b) => b.type === 'heading').length
    return { hasHeadings: headingCount >= MIN_BODY_HEADINGS, headingCount }
  }

  const matches = post.content?.match(/^#{2,4}\s+\S/gm) ?? []
  return { hasHeadings: matches.length >= MIN_BODY_HEADINGS, headingCount: matches.length }
}

export function robotsFromEligibility(result: SeoEligibilityResult): { index: boolean; follow: boolean } {
  return { index: result.indexable, follow: result.follow }
}
