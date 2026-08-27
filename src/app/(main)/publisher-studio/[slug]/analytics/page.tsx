import { notFound } from 'next/navigation'
import { loadStudioPublisherForPage } from '@/lib/publisher/studioPageAccess'
import { StudioComingSoon, PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'

interface Props {
  params: Promise<{ slug: string }>
}

/** Analytics live under Reklamlar → Reklamlarım. Standalone page stays dark (no revenue). */
export default async function PublisherStudioAnalyticsPage({ params }: Props) {
  const publisher = await loadStudioPublisherForPage((await params).slug)
  if (!publisher) notFound()
  return (
    <PublisherStudioShell slug={publisher.slug} publisher={publisher}>
      <StudioComingSoon title="Analitik" />
      <p className="mt-4 text-center text-sm text-[rgb(var(--color-muted))]">
        Gösterim, tıklama ve CTR için Reklamlar → Reklamlarım bölümünü kullanın.
      </p>
    </PublisherStudioShell>
  )
}
