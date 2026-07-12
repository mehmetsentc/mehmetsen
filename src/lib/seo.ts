import type { Metadata } from 'next'
import type { Post } from '@/types/post'
import type { NewsItem } from '@/types/newsItem'
import { getPrimaryVideo, getPostCoverAlt } from '@/lib/postUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { ROUTES } from '@/constants/routes'
import { newsItemDetailHref } from '@/lib/newsItemUtils'

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i

/** Canonical production origin — apex nahaber.com redirects here via Vercel DNS. */
export const CANONICAL_PRODUCTION_URL = 'https://www.nahaber.com'

function isDisposableDeployUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith('.vercel.app') || host === 'localhost' || host === '127.0.0.1'
  } catch {
    return true
  }
}

export function isLocalhostOrigin(url: string): boolean {
  try {
    return LOCALHOST_ORIGIN.test(new URL(url).origin)
  } catch {
    return false
  }
}

/** Public base URL for share links, sitemaps, and OG tags. */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, '')

  if (process.env.VERCEL_ENV === 'production') {
    if (!configured || isDisposableDeployUrl(configured)) {
      return CANONICAL_PRODUCTION_URL
    }
    return configured
  }

  if (configured && !isDisposableDeployUrl(configured)) {
    return configured
  }

  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '')
  }

  return 'http://localhost:3000'
}

/** Notify search engines that sitemaps were updated (best-effort). */
export async function pingSitemaps(siteUrl: string = getSiteUrl()): Promise<void> {
  const targets = [
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/news-sitemap.xml`,
  ]
  await Promise.allSettled(
    targets.map(async (sitemap) => {
      const encoded = encodeURIComponent(sitemap)
      await fetch(`https://www.bing.com/ping?sitemap=${encoded}`, {
        signal: AbortSignal.timeout(10_000),
      })
    })
  )
}

export function buildPostSharePath(post: Pick<Post, 'id'> & { slug?: string }): string {
  const slug = post.slug?.trim()
  if (slug && slug !== post.id) return ROUTES.NEWS_DETAIL(slug)
  return ROUTES.POST_DETAIL(post.id)
}

export function buildPostShareUrl(
  postOrId: string | (Pick<Post, 'id'> & { slug?: string }),
  origin?: string
): string {
  const base = (origin ?? getSiteUrl()).replace(/\/$/, '')
  if (typeof postOrId === 'string') {
    return `${base}${ROUTES.POST_DETAIL(postOrId)}`
  }
  return `${base}${buildPostSharePath(postOrId)}`
}

export function buildShareText(title: string, excerpt?: string): string {
  const trimmedTitle = title.trim()
  const trimmedExcerpt = excerpt?.trim()
  if (!trimmedExcerpt || trimmedExcerpt === trimmedTitle) return trimmedTitle
  return `${trimmedTitle}\n\n${trimmedExcerpt}`
}

/**
 * Facebook link previews require a publicly crawlable URL with OG tags.
 * localhost / 127.0.0.1 cannot be fetched by Facebook's crawler — the composer
 * stays empty and "İleri" stays disabled. Set NEXT_PUBLIC_APP_URL to your HTTPS
 * production domain for working previews (even when developing locally).
 */
export function buildFacebookShareUrl(shareUrl: string, shareText?: string): string {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID?.trim()
  const text = shareText?.trim()

  if (appId) {
    const params = new URLSearchParams({
      app_id: appId,
      href: shareUrl,
      display: 'popup',
    })
    if (text) params.set('quote', text)
    return `https://www.facebook.com/dialog/share?${params.toString()}`
  }

  const params = new URLSearchParams({ u: shareUrl })
  // quote is ignored by most modern FB builds but harmless for legacy clients
  if (text) params.set('quote', text)
  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`
}

function toAbsoluteShareImage(image: string): string {
  if (image.startsWith('http://') || image.startsWith('https://')) return image
  return `${getSiteUrl()}${image.startsWith('/') ? image : `/${image}`}`
}

export function getPostShareImage(post: Post): string | undefined {
  const video = getPrimaryVideo(post)
  const image =
    post.coverImageUrl?.trim() ||
    video?.thumbnailUrl?.trim() ||
    post.mediaItems?.find((item) => item.type === 'image')?.url?.trim() ||
    null

  if (!image) return undefined
  return toAbsoluteShareImage(image)
}

function estimateWordCount(post: Post): number {
  const text = [post.title, post.summary, post.content].filter(Boolean).join(' ')
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** schema.org NewsArticle JSON-LD for news detail pages. */
export function buildNewsArticleJsonLd(post: Post): Record<string, unknown> {
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const siteUrl = getSiteUrl()
  const url = buildPostShareUrl(post)
  const image = getPostShareImage(post)
  const coverAlt = getPostCoverAlt(post)
  const datePublished = post.publishedAt || post.createdAt
  const dateModified = post.updatedAt || datePublished
  const description =
    post.summary?.trim() ||
    post.content?.trim().slice(0, 300) ||
    `${post.title} — ${siteName}`
  const articleSection = getCategoryLabel(post.categoryId)

  // Derive a plain-text articleBody (strip HTML tags, cap at 5000 chars)
  const rawContent = post.content?.trim() || ''
  const articleBody = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 5000)

  // Author — NaHaber for syndicated news; real person only for user posts.
  const author =
    post.postType === 'user_post' && post.authorDisplayName.trim() && post.authorDisplayName !== 'nahaber'
      ? { '@type': 'Person', name: post.authorDisplayName }
      : { '@type': 'Organization', name: siteName, url: siteUrl }

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title.trim() || siteName,
    description,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished,
    dateModified,
    inLanguage: 'tr-TR',
    isAccessibleForFree: true,
    wordCount: estimateWordCount(post),
    articleSection,
    ...(articleBody ? { articleBody } : {}),
    author,
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: siteName,
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/brand/nahaber-logo.png`,
        width: 512,
        height: 512,
      },
    },
    ...(image
      ? {
          image: {
            '@type': 'ImageObject',
            url: image,
            width: 1200,
            height: 630,
            ...(coverAlt ? { caption: coverAlt } : {}),
          },
        }
      : {}),
    ...(post.tags?.length ? { keywords: post.tags.join(', ') } : {}),
    ...(post.city ? { contentLocation: { '@type': 'Place', name: post.city } } : {}),
  }
}

/** schema.org VideoObject JSON-LD for video-enabled news detail pages. */
export function buildVideoObjectJsonLd(post: Post): Record<string, unknown> | null {
  const video = getPrimaryVideo(post)
  if (!video?.url) return null

  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const siteUrl = getSiteUrl()
  const url = buildPostShareUrl(post)
  const thumbnailUrl = (video.thumbnailUrl?.trim() || getPostShareImage(post) || '').trim()
  const datePublished = post.publishedAt || post.createdAt
  const dateModified = post.updatedAt || datePublished
  const description =
    post.summary?.trim() ||
    post.seoDescription?.trim() ||
    post.content?.trim().slice(0, 280) ||
    post.title
  const durationMinutes = Math.max(1, post.readingTimeMinutes ?? 1)

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: post.title,
    description,
    ...(thumbnailUrl ? { thumbnailUrl: [thumbnailUrl] } : {}),
    uploadDate: datePublished,
    dateModified,
    contentUrl: video.url,
    embedUrl: `${siteUrl}${ROUTES.REELS_VIDEO(post.id)}`,
    duration: `PT${durationMinutes}M`,
    mainEntityOfPage: url,
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: siteName,
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/brand/nahaber-logo.png`,
        width: 512,
        height: 512,
      },
    },
  }
}

/** schema.org CollectionPage + ItemList for homepage feed SEO. */
export function buildFeedPageJsonLd(
  headlines: NewsItem[],
  siteUrl: string = getSiteUrl()
): Record<string, unknown> {
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const feedUrl = `${siteUrl}${ROUTES.FEED}`

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${siteName} — Türkiye Gündem ve Son Dakika Haberleri`,
    description:
      'Gündem, 3. sayfa, spor, dünya, siyaset, ekonomi, turizm, gezi, teknoloji, bilim, otomotiv, kültür ve magazin haberleri.',
    url: feedUrl,
    inLanguage: 'tr-TR',
    isPartOf: {
      '@type': 'WebSite',
      name: siteName,
      url: siteUrl,
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: headlines.slice(0, 12).map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl}${newsItemDetailHref(item)}`,
        name: item.title,
      })),
    },
  }
}

/** schema.org BreadcrumbList JSON-LD for news detail pages. */
export function buildNewsBreadcrumbJsonLd(post: Post): Record<string, unknown> {
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const base = getSiteUrl()
  const articleUrl = buildPostShareUrl(post)
  const items: Array<{ '@type': 'ListItem'; position: number; name: string; item?: string }> = [
    { '@type': 'ListItem', position: 1, name: siteName, item: base },
    { '@type': 'ListItem', position: 2, name: 'Haberler', item: `${base}${ROUTES.FEED}` },
  ]

  if (post.categoryId) {
    items.push({
      '@type': 'ListItem',
      position: 3,
      name: getCategoryLabel(post.categoryId),
      item: `${base}${ROUTES.CATEGORY(post.categoryId)}`,
    })
  }

  items.push({
    '@type': 'ListItem',
    position: items.length + 1,
    name: post.title.trim() || 'Haber',
    item: articleUrl,
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  }
}

export function buildPostMetadata(post: Post): Metadata {
  const url = buildPostShareUrl(post)
  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  // Prefer AI-generated SEO fields when available
  const title = (post.seoTitle?.trim() || post.title.trim() || siteName).slice(0, 70)
  const description = (
    post.seoDescription?.trim() ||
    post.summary?.trim() ||
    post.content?.trim().slice(0, 200) ||
    `${title} — ${siteName}'de oku.`
  ).slice(0, 165)
  const coverImage = getPostShareImage(post)
  const coverAlt = getPostCoverAlt(post)
  const section = getCategoryLabel(post.categoryId)

  // Build dynamic OG image URL — use cover if available, fallback to generated card
  const ogParams = new URLSearchParams({ title: title.slice(0, 100) })
  if (section) ogParams.set('category', section)
  if (coverImage) ogParams.set('image', coverImage)
  const generatedOgUrl = `${siteUrl}/api/og?${ogParams.toString()}`
  // Prefer real cover image for OG (richer), generated card as guaranteed fallback
  const image = coverImage || generatedOgUrl

  const datePublished = post.publishedAt || post.createdAt
  const dateModified = post.updatedAt || datePublished

  const seoKeywords: string[] | undefined = (post as Post & { seoKeywords?: string[] }).seoKeywords
  const keywords = [
    ...(seoKeywords?.length ? seoKeywords : []),
    ...(post.tags?.length ? post.tags : []),
  ].filter(Boolean)

  return {
    title,
    description,
    ...(keywords.length ? { keywords: keywords.join(', ') } : {}),
    robots: { index: true, follow: true },
    authors: [{ name: siteName }],
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'article',
      locale: 'tr_TR',
      url,
      title,
      description,
      siteName,
      publishedTime: datePublished,
      modifiedTime: dateModified,
      section,
      ...(post.tags?.length ? { tags: post.tags } : {}),
      ...(image
        ? {
            images: [
              {
                url: image,
                secureUrl: image.startsWith('https://') ? image : undefined,
                width: 1200,
                height: 630,
                alt: coverAlt,
                type: 'image/jpeg',
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      site: '@nahabercom',
      creator: '@nahabercom',
      title,
      description,
      ...(image ? { images: [{ url: image, alt: coverAlt }] } : {}),
    },
    other: {
      'article:published_time': datePublished,
      'article:modified_time': dateModified,
      ...(section ? { 'article:section': section } : {}),
      ...(post.tags?.length ? { 'article:tag': post.tags.join(',') } : {}),
      'twitter:image:alt': coverAlt,
      'twitter:label1': 'Okuma Süresi',
      'twitter:data1': `${Math.max(1, post.readingTimeMinutes ?? 1)} dk`,
    },
  }
}
