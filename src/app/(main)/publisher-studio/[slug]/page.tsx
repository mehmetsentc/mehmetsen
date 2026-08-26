import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { PublisherStudioOverviewClient } from '@/components/publisher/studio/PublisherStudioOverviewClient'
import { publisherRepository } from '@/services/publisher/publisherRepository'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioOverviewPage({ params }: Props) {
  if (!isPublisherStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const slug = (await params).slug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()
  return <PublisherStudioOverviewClient slug={slug} publisher={publisher} />
}
