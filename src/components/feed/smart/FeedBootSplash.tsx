import { BrandBootSplash } from '@/components/brand/BrandBootSplash'

interface FeedBootSplashProps {
  className?: string
  /** Shorter copy for inline skeleton overlays. */
  label?: string
}

/**
 * Feed V2 boot surface — shared BrandBootSplash with feed test ids.
 */
export function FeedBootSplash({
  className,
  label = 'Akış yükleniyor…',
}: FeedBootSplashProps) {
  return (
    <BrandBootSplash
      className={className}
      label={label}
      variant="inset"
      testId="feed-boot-splash"
    />
  )
}
