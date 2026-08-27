import { notFound } from 'next/navigation'
import { hasDatabaseUrl } from '@/db'
import { isAdvertiserPlatformEnabled } from '@/lib/advertiser/marketplaceFlags'
import type { ReactNode } from 'react'

export default function AdvertiserLayout({ children }: { children: ReactNode }) {
  if (!isAdvertiserPlatformEnabled() || !hasDatabaseUrl()) notFound()
  return children
}
