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
import { ROUTES } from '@/constants/routes'

// ISR: Vercel CDN caches rendered news pages for 60s (Pro edge cache)
export const revalidate = 300

// Deduplicate: generateMetadata + page both need the post — fetch once per request
const getCachedNews = cache((slug: string) => getNewsBySlug(slug))

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params

  try {
    const post = await getCachedNews(slug)
    if (!post) {
      return {
        title: 'Haber bulunamadı',
        description: 'Aradığınız içerik bulunamadı veya kaldırılmış olabilir.',
        robots: { index: false, follow: false },
      }
    }
    return buildPostMetadata(post)
  } catch {
    return {
      title: 'Haber Detayı',
      description: 'NaHaber haber detayı',
    }
  }
}

export default async function NewsDetailPage({ params }: PageProps) {
  const { slug } = await params
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

  if (post.slug && post.slug !== slug && post.slug !== post.id) {
    permanentRedirect(ROUTES.NEWS_DETAIL(post.slug))
  }

  const jsonLd = buildNewsArticleJsonLd(post)
  const breadcrumbJsonLd = buildNewsBreadcrumbJsonLd(post)
  const videoJsonLd = buildVideoObjectJsonLd(post)
  const relatedPosts = await getSuggestedPostsServer(post.id, {
    categoryId: post.categoryId ?? 'gundem',
    limit: 4,
  })

  return (
    <>
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
      <ArticlePageChrome post={post} />
      <NewsArticleStatic post={post} relatedPosts={relatedPosts} />
      <NewsArticleInteractive post={post} />
    </>
  )
}
