import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { PublisherStudioOverviewClient } from '@/components/publisher/studio/PublisherStudioOverviewClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioOverviewPage({ params }: Props) {
  const publisher = await loadStudioPublisherForPage((await params).slug)
  if (!publisher) notFound()
  return <PublisherStudioOverviewClient slug={publisher.slug} publisher={publisher} />
}
