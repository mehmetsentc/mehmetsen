import { notFound } from 'next/navigation'
import { LiveBlogView } from '@/components/news/LiveBlogView'
import { getNewsBySlug } from '@/services/newsService.server'

export const revalidate = 120

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function LiveBlogPage({ params }: PageProps) {
  const { slug } = await params
  const post = await getNewsBySlug(slug)

  if (!post) notFound()

  // Only explicit live-blog flag (or non-empty liveUpdates) opens this surface.
  // Auto-promoting every son-dakika / "canli" tag caused false positives.
  const isLiveBlog =
    post.isLiveBlog === true ||
    (Array.isArray(post.liveUpdates) && post.liveUpdates.length > 0)

  if (!isLiveBlog) notFound()

  return <LiveBlogView post={post} updates={post.liveUpdates} />
}
