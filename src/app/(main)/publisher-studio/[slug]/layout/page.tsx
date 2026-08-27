import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { PublisherStudioLayoutHubClient } from '@/components/publisher/studio/PublisherStudioLayoutHubClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioLayoutPage({ params }: Props) {
  const publisher = await loadStudioPublisherForPage((await params).slug)
  if (!publisher) notFound()
  return <PublisherStudioLayoutHubClient slug={publisher.slug} publisher={publisher} />
}
