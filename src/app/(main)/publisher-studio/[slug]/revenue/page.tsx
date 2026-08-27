import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { StudioComingSoon, PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'

interface Props {
  params: Promise<{ slug: string }>
}

/** Revenue / payment stays dark in P11 — page is gated but never promoted in nav. */
export default async function PublisherStudioRevenuePage({ params }: Props) {
  const publisher = await loadStudioPublisherForPage((await params).slug)
  if (!publisher) notFound()
  return (
    <PublisherStudioShell slug={publisher.slug} publisher={publisher}>
      <StudioComingSoon title="Gelirler" />
      <p className="mt-4 text-center text-sm text-[rgb(var(--color-muted))]">
        Ödeme ve gelir özellikleri kapalıdır.
      </p>
    </PublisherStudioShell>
  )
}
