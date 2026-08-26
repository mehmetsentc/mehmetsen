import type { Post } from '@/types/post'
import type { PublicPublisherRecord } from '@/types/publisher'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { DEFAULT_CATEGORIES, getParentCategory } from '@/constants/config'
import {
  getSiteUrl,
  buildPostShareUrl,
  getPostShareImage,
  buildNewsArticleJsonLd as legacyNewsArticleJsonLd,
  buildNewsBreadcrumbJsonLd as legacyBreadcrumbJsonLd,
} from '@/lib/seo'
import { getPostCoverAlt } from '@/lib/postUtils'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'

export { buildNewsArticleJsonLd, buildNewsBreadcrumbJsonLd } from '@/lib/seo'

/** Re-export legacy builders — article SEO unchanged when flags off. */
export function buildArticleNewsArticleJsonLd(post: Post): Record<string, unknown> {
  return legacyNewsArticleJsonLd(post)
}

export function buildArticleBreadcrumbJsonLd(post: Post): Record<string, unknown> {
  return legacyBreadcrumbJsonLd(post)
}

export function buildPublisherOrganizationJsonLd(
  publisher: Pick<
    PublicPublisherRecord,
    'displayName' | 'slug' | 'description' | 'logoUrl' | 'websiteUrl' | 'verificationStatus' | 'isVerified'
  >
): Record<string, unknown> {
  const siteUrl = getSiteUrl()
  const url = `${siteUrl}${ROUTES.PUBLISHER(publisher.slug)}`
  const verified = publisher.isVerified && publisher.verificationStatus === 'VERIFIED'

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    name: publisher.displayName,
    url,
    ...(publisher.description ? { description: publisher.description.trim() } : {}),
    ...(publisher.logoUrl ? { logo: { '@type': 'ImageObject', url: publisher.logoUrl } } : {}),
    ...(publisher.websiteUrl ? { sameAs: [publisher.websiteUrl] } : {}),
    ...(verified
      ? {
          publishingPrinciples: `${siteUrl}/editoryal-ilkeler`,
          actionableFeedbackPolicy: `${siteUrl}/iletisim`,
        }
      : {
          additionalType: 'https://schema.org/Organization',
          disambiguatingDescription: 'Bu yayın kuruluşu henüz doğrulanmamıştır.',
        }),
  }
}

export function buildEventPageJsonLd(input: {
  slug: string
  canonicalTitle: string
  summary?: string | null
  sourceCount: number
  representativeArticleUrl?: string | null
  dateModified?: string | null
}): Record<string, unknown> {
  const siteUrl = getSiteUrl()
  const url = `${siteUrl}${ROUTES.EVENT(input.slug)}`
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: input.canonicalTitle,
    description: input.summary?.trim() || input.canonicalTitle,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.representativeArticleUrl
      ? { isBasedOn: { '@type': 'NewsArticle', url: input.representativeArticleUrl } }
      : {}),
    citation: {
      '@type': 'CreativeWork',
      name: `${input.sourceCount} haber kaynağı`,
    },
    inLanguage: 'tr-TR',
  }
}

export function buildCollectionBreadcrumbJsonLd(
  items: Array<{ name: string; item?: string }>
): Record<string, unknown> {
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const base = getSiteUrl()
  const list = [
    { '@type': 'ListItem' as const, position: 1, name: siteName, item: base },
    ...items.map((entry, i) => ({
      '@type': 'ListItem' as const,
      position: i + 2,
      name: entry.name,
      ...(entry.item ? { item: entry.item } : {}),
    })),
  ]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list,
  }
}

/** Extended NewsArticle with publisher link when available. */
export function buildEnhancedNewsArticleJsonLd(
  post: Post,
  opts?: { publisherName?: string | null; publisherUrl?: string | null; eventUrl?: string | null }
): Record<string, unknown> {
  const base = legacyNewsArticleJsonLd(post) as Record<string, unknown>
  if (opts?.publisherName && opts.publisherUrl) {
    base.sourceOrganization = {
      '@type': 'NewsMediaOrganization',
      name: opts.publisherName,
      url: opts.publisherUrl,
    }
  }
  if (opts?.eventUrl) {
    base.about = { '@type': 'Event', url: opts.eventUrl }
  }
  return base
}

export function estimateArticleWordCount(post: Post): number {
  const blockText = post.bodyBlocks?.length ? articleBlocksToPlainText(post.bodyBlocks) : ''
  const text = [post.title, post.summary, blockText || post.content].filter(Boolean).join(' ')
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function articleShareImage(post: Post): string | undefined {
  return getPostShareImage(post)
}

export function articleCoverAlt(post: Post): string {
  return getPostCoverAlt(post)
}

export function categoryBreadcrumbItems(categoryId: string): Array<{ name: string; item?: string }> {
  const base = getSiteUrl()
  const items: Array<{ name: string; item?: string }> = [
    { name: 'Haberler', item: `${base}${ROUTES.FEED}` },
  ]
  const catDef = DEFAULT_CATEGORIES.find((c) => c.id === categoryId)
  const catSlug = catDef?.slug ?? categoryId
  const parentCat = catDef?.parentId ? getParentCategory(categoryId) : null
  if (parentCat) {
    items.push({
      name: getCategoryLabel(parentCat.id),
      item: `${base}${ROUTES.CATEGORY(parentCat.slug ?? parentCat.id)}`,
    })
  }
  items.push({
    name: getCategoryLabel(categoryId),
    item: `${base}${ROUTES.CATEGORY(catSlug)}`,
  })
  return items
}

export function buildPostSharePath(post: Pick<Post, 'id' | 'slug'>): string {
  return buildPostShareUrl(post).replace(getSiteUrl(), '')
}
