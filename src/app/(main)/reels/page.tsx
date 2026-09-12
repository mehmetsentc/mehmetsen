import type { Metadata } from 'next'
import { ReelsLoader } from '@/components/video/ReelsLoader'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'Video Haberler',
  description: 'Kısa video haberler, reels ve gündem videoları',
  alternates: {
    canonical: `${getSiteUrl()}${ROUTES.REELS}`,
  },
  openGraph: {
    title: 'Video Haberler | NaHaber',
    description: 'Gündem ve son dakika video haber içerikleri',
    url: `${getSiteUrl()}${ROUTES.REELS}`,
    type: 'website',
  },
}

/**
 * Height is reserved on the wrapper. The boot skeleton lives in
 * ReelsLoader's dynamic `loading` slot so it unmounts when the client
 * bundle arrives — a permanent sibling overlay left "Yükleniyor…" on
 * top of real cards.
 */
export default function ReelsPage() {
  return (
    <div className="dark min-h-[100dvh] bg-black" style={{ colorScheme: 'dark' }}>
      <div className="relative mx-auto min-h-[min(100dvh,920px)] w-full max-w-lg bg-black">
        <ReelsLoader />
      </div>
    </div>
  )
}
