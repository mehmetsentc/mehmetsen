import { cn } from '@/lib/utils'

/** App icon / favicon tile — same mark as the home-screen icon. */
export const FEED_V2_BRAND_MARK_SRC = '/apple-touch-icon.png'

interface FeedV2BrandLoaderProps {
  className?: string
}

/** Full-bleed brand wait state while Feed 2 streams or first cards resolve. */
export function FeedV2BrandLoader({ className }: FeedV2BrandLoaderProps) {
  return (
    <div
      className={cn('feed-v2-brand-loader', className)}
      role="status"
      aria-busy="true"
      aria-label="Yükleniyor"
      data-testid="feed-v2-brand-loader"
    >
      <span className="feed-v2-brand-loader__glow" aria-hidden />
      <img
        src={FEED_V2_BRAND_MARK_SRC}
        alt=""
        width={180}
        height={180}
        className="feed-v2-brand-loader__mark"
        decoding="async"
      />
      <span className="sr-only">NaHaber yükleniyor</span>
    </div>
  )
}
