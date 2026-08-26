import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { PublisherStudioLayoutHubClient } from '@/components/publisher/studio/PublisherStudioLayoutHubClient'
import { publisherRepository } from '@/services/publisher/publisherRepository'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioLayoutPage({ params }: Props) {
  if (!isPublisherStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const slug = (await params).slug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()
  return <PublisherStudioLayoutHubClient slug={slug} publisher={publisher} />
}
