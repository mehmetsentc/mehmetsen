import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { isPublisherContentStudioEnabled } from '@/lib/publisher/contentFlags'
import { publisherRepository } from '@/services/publisher/publisherRepository'
import { publisherContentRepository } from '@/services/publisher/publisherContentRepository'
import { ArticleBlocksRenderer } from '@/components/news/ArticleBlocksRenderer'
import { contentBodyPlainText } from '@/lib/publisher/contentDomain'

interface Props {
  params: Promise<{ slug: string; contentId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Önizleme — Publisher Studio',
    robots: { index: false, follow: false, nocache: true },
  }
}

export default async function PublisherContentPreviewPage({ params }: Props) {
  if (!isPublisherStudioEnabled() || !isPublisherContentStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()
  const { slug: rawSlug, contentId } = await params
  const slug = rawSlug.trim().toLowerCase()
  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()

  const item = await publisherContentRepository.findById(contentId)
  if (!item || item.publisherId !== publisher.id) notFound()

  const plain = contentBodyPlainText(item)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <meta name="robots" content="noindex,nofollow" />
      <p className="mb-4 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        Özel önizleme · {publisher.displayName} · noindex
      </p>
      <article>
        <h1 className="text-3xl font-black text-[rgb(var(--color-text))]">{item.title || 'Başlıksız'}</h1>
        {item.spot ? (
          <p className="mt-3 text-lg font-medium text-[rgb(var(--color-text))]/90">{item.spot}</p>
        ) : null}
        {item.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.heroImageUrl}
            alt=""
            className="mt-6 w-full rounded-lg object-cover"
          />
        ) : null}
        <div className="prose prose-neutral mt-6 max-w-none dark:prose-invert">
          {item.bodyBlocks?.length ? (
            <ArticleBlocksRenderer blocks={item.bodyBlocks} title={item.title || 'Önizleme'} />
          ) : (
            <p className="whitespace-pre-wrap text-[rgb(var(--color-text))]">{plain}</p>
          )}
        </div>
      </article>
    </div>
  )
}
