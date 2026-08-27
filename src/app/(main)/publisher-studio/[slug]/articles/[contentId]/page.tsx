import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { isContentStudioEffectiveForPublisher } from '@/lib/publisher/effectiveFlags'
import { PublisherContentEditorClient } from '@/components/publisher/studio/content/PublisherContentEditorClient'

interface Props {
  params: Promise<{ slug: string; contentId: string }>
}

export default async function PublisherStudioEditArticlePage({ params }: Props) {
  const { slug: rawSlug, contentId } = await params
  const publisher = await loadStudioPublisherForPage(rawSlug)
  if (!publisher) notFound()
  if (!(await isContentStudioEffectiveForPublisher(publisher.id))) notFound()
  return (
    <PublisherContentEditorClient
      slug={publisher.slug}
      publisher={publisher}
      contentId={contentId}
    />
  )
}
