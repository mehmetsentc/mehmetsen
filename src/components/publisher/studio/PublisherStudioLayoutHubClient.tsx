'use client'

import Link from 'next/link'
import { PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { ROUTES } from '@/constants/routes'
import type { PublisherRecord } from '@/types/publisher'

export function PublisherStudioLayoutHubClient({
  slug,
  publisher,
}: {
  slug: string
  publisher: PublisherRecord
}) {
  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <h1 className="text-2xl font-black">Sayfa Düzeni</h1>
      <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
        Taslak düzeninizi oluşturun, önizleyin ve yayınlayın. Değişiklikler yayınlanana kadar public profilde görünmez.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={ROUTES.PUBLISHER_STUDIO.LAYOUT_EDIT(slug)} className="studio-btn-primary">
          Düzenle
        </Link>
        <Link href={ROUTES.PUBLISHER(publisher.slug)} className="studio-btn" target="_blank">
          Public profili aç
        </Link>
      </div>
    </PublisherStudioShell>
  )
}
