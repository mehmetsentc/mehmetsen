import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isAdMarketplaceEnabled } from '@/lib/advertiser/marketplaceFlags'
import { InventoryDetailClient } from '@/components/advertiser/InventoryDetailClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ inventoryId: string }>
}

export default async function ReklamAlaniPage({ params }: Props) {
  if (!isAdMarketplaceEnabled() || !hasDatabaseUrl()) notFound()
  const { inventoryId } = await params
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-amber-50/30">
      <Suspense fallback={<p className="p-8">Yükleniyor…</p>}>
        <InventoryDetailClient inventoryId={inventoryId} />
      </Suspense>
    </div>
  )
}
