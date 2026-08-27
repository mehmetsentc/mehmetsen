import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isPublisherStudioEnabled } from '@/lib/publisher/featureFlag'
import { isPublisherContentStudioEnabled } from '@/lib/publisher/contentFlags'
import { publisherRepository } from '@/services/publisher/publisherRepository'
import { PublisherContentPreviewClient } from '@/components/publisher/studio/content/PublisherContentPreviewClient'

interface Props {
  params: Promise<{ slug: string; contentId: string }>
}

/**
 * P7 preview — private, noindex.
 * Content is NEVER loaded on the server; client fetches with Firebase auth + content:read.
 * Flag OFF → notFound (still no content leak).
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Önizleme — Publisher Studio',
    robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
    other: {
      googlebot: 'noindex,nofollow,noarchive,nosnippet',
    },
  }
}

export default async function PublisherContentPreviewPage({ params }: Props) {
  // Always no public content path — even when flags are off we must not leak.
  if (!isPublisherStudioEnabled() || !isPublisherContentStudioEnabled()) notFound()
  if (!hasDatabaseUrl()) notFound()

  const { slug: rawSlug, contentId } = await params
  const slug = rawSlug.trim().toLowerCase()
  if (!contentId || !/^[a-zA-Z0-9_-]+$/.test(contentId)) notFound()

  const publisher = await publisherRepository.findBySlug(slug)
  if (!publisher) notFound()

  // Do NOT fetch content body here — membership checked via authenticated API.
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />
      <meta httpEquiv="Cache-Control" content="private, no-store, max-age=0" />
      <p className="mb-4 rounded-md bg-amber-100 px-3 py-2 text-xs font-black uppercase tracking-wide text-amber-950">
        ÖNİZLEME — Yayında değil · {publisher.displayName} · noindex · üyelik gerekli
      </p>
      <PublisherContentPreviewClient publisherId={publisher.id} contentId={contentId} />
    </div>
  )
}
