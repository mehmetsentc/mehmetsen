import type { Metadata } from 'next'
import { ReelsLoader } from '@/components/video/ReelsLoader'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'Video',
  description: 'Oynatılabilir görüntülü haber videoları',
  alternates: {
    canonical: `${getSiteUrl()}${ROUTES.VIDEO}`,
  },
  openGraph: {
    title: 'Video | NaHaber',
    description: 'Gündem ve yerel haber videoları',
    url: `${getSiteUrl()}${ROUTES.VIDEO}`,
    type: 'website',
  },
}

export default function VideoPage() {
  return (
    <div className="dark min-h-[100dvh] bg-black" style={{ colorScheme: 'dark' }}>
      <div className="relative mx-auto min-h-[min(100dvh,920px)] w-full max-w-lg bg-black">
        <ReelsLoader surface="video" />
      </div>
    </div>
  )
}
