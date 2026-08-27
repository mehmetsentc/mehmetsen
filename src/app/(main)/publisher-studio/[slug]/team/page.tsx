import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { PublisherStudioTeamClient } from '@/components/publisher/studio/PublisherStudioTeamClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioTeamPage({ params }: Props) {
  const publisher = await loadStudioPublisherForPage((await params).slug)
  if (!publisher) notFound()
  return <PublisherStudioTeamClient slug={publisher.slug} publisher={publisher} />
}
