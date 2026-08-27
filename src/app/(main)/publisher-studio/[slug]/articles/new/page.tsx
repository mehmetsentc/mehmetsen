import { notFound, redirect } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { isPublisherContentStudioEnabled } from '@/lib/publisher/contentFlags'
import { publisherRepository } from '@/services/publisher/publisherRepository'
import { ROUTES } from '@/constants/routes'

interface Props {
  params: Promise<{ slug: string }>
}

/** Creates a draft via client — redirect to studio list with intent. */
export default async function PublisherStudioNewArticlePage({ params }: Props) {
  if (!isPublisherStudioEnabled() || !isPublisherContentStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const slug = (await params).slug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()
  redirect(`${ROUTES.PUBLISHER_STUDIO.ARTICLES(slug)}?new=1`)
}
