import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { PublisherStudioLayoutEditClient } from '@/components/publisher/studio/PublisherStudioLayoutEditClient'
import { publisherLayoutRepository } from '@/services/publisher/publisherLayoutRepository'
import { publisherRepository } from '@/services/publisher/publisherRepository'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublisherStudioLayoutEditPage({ params }: Props) {
  if (!isPublisherStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const slug = (await params).slug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()

  const draft = await publisherLayoutRepository.ensureDraftLayout(publisher.id, null)
  const sections = await publisherLayoutRepository.listSectionsForLayout(draft.id)
  const items = await publisherLayoutRepository.listItemsForLayout(draft.id)

  return (
    <PublisherStudioLayoutEditClient
      slug={slug}
      publisher={publisher}
      initialLayout={{
        layout: draft,
        sections: sections.map((section) => ({
          section,
          items: items.filter((i) => i.sectionId === section.id).map((item) => ({ ...item, article: null })),
        })),
      }}
    />
  )
}
