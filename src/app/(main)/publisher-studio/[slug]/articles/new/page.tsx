import { notFound, redirect } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { isContentStudioEffectiveForPublisher } from '@/lib/publisher/effectiveFlags'
import { ROUTES } from '@/constants/routes'

interface Props {
  params: Promise<{ slug: string }>
}

/** Creates a draft via client — redirect to studio list with intent. */
export default async function PublisherStudioNewArticlePage({ params }: Props) {
  const publisher = await loadStudioPublisherForPage((await params).slug)
  if (!publisher) notFound()
  if (!(await isContentStudioEffectiveForPublisher(publisher.id))) notFound()
  redirect(`${ROUTES.PUBLISHER_STUDIO.ARTICLES(publisher.slug)}?new=1`)
}
