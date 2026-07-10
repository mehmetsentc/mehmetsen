import { notFound } from 'next/navigation'
import { LiveBlogView } from '@/components/news/LiveBlogView'
import { getNewsBySlug } from '@/services/newsService.server'

export const revalidate = 30

type PageProps = {
  params: Promise<{ slug: string }>
}

export default async function LiveBlogPage({ params }: PageProps) {
  const { slug } = await params
  const post = await getNewsBySlug(slug)

  if (!post) notFound()

  const isLiveBlog =
    post.isLiveBlog === true ||
    post.categoryId === 'son-dakika' ||
    (post.tags ?? []).includes('canli')

  if (!isLiveBlog) notFound()

  return <LiveBlogView post={post} updates={post.liveUpdates} />
}
