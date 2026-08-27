import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { isPublisherContentStudioEnabled } from '@/lib/publisher/contentFlags'
import { PublisherContentEditorClient } from '@/components/publisher/studio/content/PublisherContentEditorClient'
import { publisherRepository } from '@/services/publisher/publisherRepository'

interface Props {
  params: Promise<{ slug: string; contentId: string }>
}

export default async function PublisherStudioEditArticlePage({ params }: Props) {
  if (!isPublisherStudioEnabled() || !isPublisherContentStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const { slug: rawSlug, contentId } = await params
  const slug = rawSlug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()
  return <PublisherContentEditorClient slug={slug} publisher={publisher} contentId={contentId} />
}
