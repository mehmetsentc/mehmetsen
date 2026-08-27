import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { isPublisherContentStudioEnabled } from '@/lib/publisher/contentFlags'
import { PublisherContentStudioClient } from '@/components/publisher/studio/content/PublisherContentStudioClient'
import { publisherRepository } from '@/services/publisher/publisherRepository'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioArticlesPage({ params }: Props) {
  if (!isPublisherStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const slug = (await params).slug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()

  if (isPublisherContentStudioEnabled()) {
    return <PublisherContentStudioClient slug={slug} publisher={publisher} />
  }

  // Fallback: legacy read-only articles list when Content Studio flag is off
  const { PublisherStudioArticlesClient } = await import(
    '@/components/publisher/studio/PublisherStudioArticlesClient'
  )
  return <PublisherStudioArticlesClient slug={slug} publisher={publisher} />
}
