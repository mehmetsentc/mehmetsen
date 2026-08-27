import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isAdMarketplaceEnabled } from '@/lib/advertiser/marketplaceFlags'
import { MarketplaceBrowseClient } from '@/components/advertiser/MarketplaceBrowseClient'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function ReklamPazariPage() {
  if (!isAdMarketplaceEnabled() || !hasDatabaseUrl()) notFound()

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50/50 to-stone-200/40">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <p className="mb-2 text-sm font-medium uppercase tracking-wide text-amber-900/70">
          NaHaber
        </p>
        <h1 className="mb-2 text-4xl font-semibold tracking-tight text-stone-900">
          NaHaber Reklam Pazarı
        </h1>
        <p className="mb-8 max-w-2xl text-stone-600">
          Doğrulanmış yayıncıların satışa açık reklam alanlarını keşfedin. Ödeme bu fazda yoktur —
          yalnızca rezervasyon talebi oluşturabilirsiniz.
        </p>
        <div className="mb-8 flex gap-4 text-sm">
          <Link href="/advertiser/onboarding" className="rounded bg-stone-900 px-4 py-2 text-white">
            Reklam Ver
          </Link>
          <Link href="/advertiser" className="rounded border border-stone-400 px-4 py-2">
            Stüdyoya Git
          </Link>
        </div>
        <MarketplaceBrowseClient />
      </div>
    </div>
  )
}
