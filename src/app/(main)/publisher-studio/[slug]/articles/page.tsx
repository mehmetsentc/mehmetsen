import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { PublisherStudioArticlesClient } from '@/components/publisher/studio/PublisherStudioArticlesClient'
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
  return <PublisherStudioArticlesClient slug={slug} publisher={publisher} />
}
