import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { NewsArticleClient } from '@/components/news/NewsArticleClient'
import {
  buildNewsArticleJsonLd,
  buildNewsBreadcrumbJsonLd,
  buildPostMetadata,
} from '@/lib/seo'
import { getNewsBySlug } from '@/services/newsService.server'
import { ROUTES } from '@/constants/routes'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params

  try {
    const post = await getNewsBySlug(slug)
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
    post = await getNewsBySlug(slug)
  } catch {
    // Client fallback
  }

  if (!post) {
    notFound()
  }

  if (post.slug && post.slug !== slug && post.slug !== post.id) {
    redirect(ROUTES.NEWS_DETAIL(post.slug))
  }

  const jsonLd = buildNewsArticleJsonLd(post)
  const breadcrumbJsonLd = buildNewsBreadcrumbJsonLd(post)

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
      <NewsArticleClient postId={post.id} />
    </>
  )
}
