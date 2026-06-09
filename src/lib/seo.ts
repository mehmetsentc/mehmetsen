import type { Metadata } from 'next'
import type { Post } from '@/types/post'
import { getPrimaryVideo } from '@/lib/postUtils'
import { getCategoryLabel } from '@/lib/newsMapper'
import { ROUTES } from '@/constants/routes'

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i

export function isLocalhostOrigin(url: string): boolean {
  try {
    return LOCALHOST_ORIGIN.test(new URL(url).origin)
  } catch {
    return false
  }
}

/** Public base URL for share links and OG tags. Prefer NEXT_PUBLIC_APP_URL (HTTPS in prod). */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '')
  return 'http://localhost:3000'
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
  const url = buildPostShareUrl(post)
  const image = getPostShareImage(post)
  const datePublished = post.publishedAt || post.createdAt
  const dateModified = post.updatedAt || datePublished
  const description =
    post.summary?.trim() ||
    post.content?.trim().slice(0, 300) ||
    `${post.title} — ${siteName}`
  const articleSection = getCategoryLabel(post.categoryId)

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
    author: {
      '@type': 'Organization',
      name: post.source?.trim() || siteName,
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      logo: {
        '@type': 'ImageObject',
        url: `${getSiteUrl()}/brand/nahaber-logo.png`,
      },
    },
    ...(image ? { image: [image] } : {}),
    ...(post.tags?.length ? { keywords: post.tags.join(', ') } : {}),
    ...(post.city ? { contentLocation: { '@type': 'Place', name: post.city } } : {}),
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
      item: `${base}${ROUTES.FEED}?category=${encodeURIComponent(post.categoryId)}`,
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
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  // Prefer AI-generated SEO fields when available
  const title = (post.seoTitle?.trim() || post.title.trim() || siteName).slice(0, 70)
  const description = (
    post.seoDescription?.trim() ||
    post.summary?.trim() ||
    post.content?.trim().slice(0, 200) ||
    `${title} — ${siteName}'de oku.`
  ).slice(0, 165)
  const image = getPostShareImage(post)
  const datePublished = post.publishedAt || post.createdAt
  const dateModified = post.updatedAt || datePublished
  const section = getCategoryLabel(post.categoryId)
  const source = post.source?.trim()

  return {
    title,
    description,
    ...(source ? { authors: [{ name: source }] } : {}),
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
                alt: title,
                type: 'image/jpeg',
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}
