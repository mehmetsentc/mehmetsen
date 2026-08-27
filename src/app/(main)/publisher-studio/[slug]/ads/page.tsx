import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { isPublisherAdInventoryEnabled } from '@/lib/publisher/adInventoryFlags'
import { StudioComingSoon, PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { PublisherAdsStudioClient } from '@/components/publisher/studio/PublisherAdsStudioClient'
import { publisherRepository } from '@/services/publisher/publisherRepository'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioAdsPage({ params }: Props) {
  if (!isPublisherStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const slug = (await params).slug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()

  if (!isPublisherAdInventoryEnabled()) {
    return (
      <PublisherStudioShell slug={slug} publisher={publisher}>
        <StudioComingSoon title="Reklamlar" />
      </PublisherStudioShell>
    )
  }

  return <PublisherAdsStudioClient slug={slug} publisher={publisher} />
}
