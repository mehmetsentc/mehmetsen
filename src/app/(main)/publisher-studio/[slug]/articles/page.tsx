import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { isContentStudioEffectiveForPublisher } from '@/lib/publisher/effectiveFlags'
import { PublisherContentStudioClient } from '@/components/publisher/studio/content/PublisherContentStudioClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioArticlesPage({ params }: Props) {
  const publisher = await loadStudioPublisherForPage((await params).slug)
  if (!publisher) notFound()

  if (await isContentStudioEffectiveForPublisher(publisher.id)) {
    return <PublisherContentStudioClient slug={publisher.slug} publisher={publisher} />
  }

  const { PublisherStudioArticlesClient } = await import(
    '@/components/publisher/studio/PublisherStudioArticlesClient'
  )
  return <PublisherStudioArticlesClient slug={publisher.slug} publisher={publisher} />
}
