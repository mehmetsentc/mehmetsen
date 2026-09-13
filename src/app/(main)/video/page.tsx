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
    <div className="dark h-full min-h-0 w-full bg-black" style={{ colorScheme: 'dark' }}>
      <div className="relative h-full min-h-0 w-full bg-black">
        <ReelsLoader surface="video" />
      </div>
    </div>
  )
}
