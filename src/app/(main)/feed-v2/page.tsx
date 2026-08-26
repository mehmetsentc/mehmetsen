import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SmartFeedClient } from '@/components/feed/smart/SmartFeedClient'
import { isSmartFeedEnabled } from '@/lib/feed/featureFlag'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Akıllı Haber Akışı',
  description: 'Tam ekran dikey haber akışı — Sana Özel, Takip, Son Dakika ve Yerel.',
  robots: { index: false, follow: false },
}

export default function FeedV2Page() {
  if (!isSmartFeedEnabled()) notFound()

  const debug = process.env.NODE_ENV !== 'production'

  return <SmartFeedClient debug={debug} />
}
