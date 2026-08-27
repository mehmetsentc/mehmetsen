'use client'

import { useParams } from 'next/navigation'
import { AdvertiserStudioShell } from '@/components/advertiser/AdvertiserStudioShell'
import { MarketplaceBrowseClient } from '@/components/advertiser/MarketplaceBrowseClient'

export default function AdvertiserMarketplacePage() {
  const params = useParams()
  const id = String(params.advertiserId || '')
  return (
    <AdvertiserStudioShell title="Pazar Yeri">
      <MarketplaceBrowseClient advertiserId={id} />
    </AdvertiserStudioShell>
  )
}
