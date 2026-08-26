'use client'

import { LayoutComposerClient } from '@/components/publisher/studio/LayoutComposerClient'
import { PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import type { PublisherRecord } from '@/types/publisher'
import type { ResolvedPublisherLayout } from '@/types/publisherLayout'

export function PublisherStudioLayoutEditClient({
  slug,
  publisher,
  initialLayout,
}: {
  slug: string
  publisher: PublisherRecord
  initialLayout: ResolvedPublisherLayout
}) {
  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <h1 className="mb-4 text-2xl font-black">Sayfa Düzeni — Düzenle</h1>
      <LayoutComposerClient publisherId={publisher.id} slug={slug} initialLayout={initialLayout} />
    </PublisherStudioShell>
  )
}
