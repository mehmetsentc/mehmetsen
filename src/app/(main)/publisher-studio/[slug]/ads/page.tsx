import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { isAdInventoryEffectiveForPublisher } from '@/lib/publisher/effectiveFlags'
import { StudioComingSoon, PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { PublisherAdsStudioClient } from '@/components/publisher/studio/PublisherAdsStudioClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioAdsPage({ params }: Props) {
  const slug = (await params).slug
  const publisher = await loadStudioPublisherForPage(slug)
  if (!publisher) notFound()

  if (!(await isAdInventoryEffectiveForPublisher(publisher.id))) {
    return (
      <PublisherStudioShell slug={publisher.slug} publisher={publisher}>
        <StudioComingSoon title="Reklamlar" />
      </PublisherStudioShell>
    )
  }

  return <PublisherAdsStudioClient slug={publisher.slug} publisher={publisher} />
}
