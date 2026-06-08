import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PostDetailClient } from '@/components/post/PostDetailClient'
import { buildNewsArticleJsonLd, buildPostMetadata } from '@/lib/seo'
import { getNewsById } from '@/services/newsService.server'
import { ROUTES } from '@/constants/routes'

type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params

  try {
    const post = await getNewsById(id)
    if (!post) {
      return {
        title: 'Haber bulunamadı',
        description: 'Aradığınız içerik bulunamadı veya kaldırılmış olabilir.',
        robots: { index: false, follow: false },
      }
    }
    // Pulls title, description, og:url, og:image from the Firestore post document.
    return buildPostMetadata(post)
  } catch {
    return {
      title: 'Haber Detayı',
      description: 'NaHaber haber detayı',
    }
  }
}

export default async function PostDetailPage({ params }: PageProps) {
  const { id } = await params
  let jsonLd: Record<string, unknown> | null = null

  const post = await getNewsById(id).catch(() => null)
  if (post?.slug && post.slug !== post.id) {
    redirect(ROUTES.NEWS_DETAIL(post.slug))
  }
  if (post) jsonLd = buildNewsArticleJsonLd(post)

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <PostDetailClient postId={id} />
    </>
  )
}
