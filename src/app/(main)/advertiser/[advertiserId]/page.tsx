'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AdvertiserStudioShell } from '@/components/advertiser/AdvertiserStudioShell'

export default function AdvertiserOverviewPage() {
  const params = useParams()
  const id = String(params.advertiserId || '')
  return (
    <AdvertiserStudioShell title="Genel Bakış">
      <div className="space-y-4 text-stone-700">
        <p>
          Kampanyalarınız için yayıncı reklam alanlarını keşfedin, talep gönderin ve kreatiflerinizi
          hazırlayın. Ödeme ve gelir bu fazda yoktur.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/advertiser/${id}/marketplace`}
            className="rounded bg-stone-900 px-4 py-2 text-sm text-white"
          >
            Pazar Yeri
          </Link>
          <Link
            href={`/advertiser/${id}/campaigns`}
            className="rounded border border-stone-300 px-4 py-2 text-sm"
          >
            Kampanyalar
          </Link>
          <Link href="/reklam-pazari" className="rounded border border-stone-300 px-4 py-2 text-sm">
            Genel pazar
          </Link>
        </div>
      </div>
    </AdvertiserStudioShell>
  )
}
