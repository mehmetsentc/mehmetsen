import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { StudioComingSoon, PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { publisherRepository } from '@/services/publisher/publisherRepository'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioAnalyticsPage({ params }: Props) {
  if (!isPublisherStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const slug = (await params).slug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()
  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <StudioComingSoon title="Analitik" />
    </PublisherStudioShell>
  )
}
