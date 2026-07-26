import type { Metadata } from 'next'
import { ReelsLoader } from '@/components/video/ReelsLoader'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'Video Haberler | NaHaber',
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
 * SSR’da sabit yükseklikli iskelet — ssr:false video bundle gelene kadar CLS’i keser.
 */
export default function ReelsPage() {
  return (
    <div className="dark min-h-[100dvh] bg-black" style={{ colorScheme: 'dark' }}>
      <div className="relative mx-auto min-h-[min(100dvh,920px)] w-full max-w-lg bg-black">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black via-transparent to-black/40 p-6">
          <p className="text-sm font-semibold text-white/90">Video Haberler</p>
          <p className="mt-1 text-xs text-white/50">Yükleniyor…</p>
        </div>
        <ReelsLoader />
      </div>
    </div>
  )
}
