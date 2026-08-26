'use client'

import Link from 'next/link'
import { PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { ROUTES } from '@/constants/routes'
import type { PublisherRecord } from '@/types/publisher'

export function PublisherStudioOverviewClient({
  slug,
  publisher,
}: {
  slug: string
  publisher: PublisherRecord
}) {
  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <h1 className="text-2xl font-black">Genel Bakış</h1>
      <p className="mt-2 text-sm text-[rgb(var(--color-muted))]">
        {publisher.displayName} yayınını yönetin.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href={ROUTES.PUBLISHER_STUDIO.PROFILE(slug)} className="studio-card">
          Profil ayarları
        </Link>
        <Link href={ROUTES.PUBLISHER_STUDIO.LAYOUT(slug)} className="studio-card">
          Sayfa düzeni
        </Link>
        <Link href={ROUTES.PUBLISHER_STUDIO.ARTICLES(slug)} className="studio-card">
          Haberler
        </Link>
        <Link href={ROUTES.PUBLISHER(publisher.slug)} className="studio-card" target="_blank">
          Public profili görüntüle
        </Link>
      </div>
    </PublisherStudioShell>
  )
}
