import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { PublisherStudioProfileClient } from '@/components/publisher/studio/PublisherStudioProfileClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioProfilePage({ params }: Props) {
  const publisher = await loadStudioPublisherForPage((await params).slug)
  if (!publisher) notFound()
  return <PublisherStudioProfileClient slug={publisher.slug} publisher={publisher} />
}
