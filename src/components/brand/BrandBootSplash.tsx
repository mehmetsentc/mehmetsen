import { BrandBootMark } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'

interface BrandBootSplashProps {
  className?: string
  label?: string
  /** full = viewport fill; inset = fill parent (feed card height). */
  variant?: 'full' | 'inset'
  testId?: string
}

/**
 * Shared NaHaber boot splash — app open, route loading, feed bootstrap.
 * Uses the rounded N mark (public/brand/nahaber-boot-mark.png).
 */
export function BrandBootSplash({
  className,
  label = 'Yükleniyor…',
  variant = 'full',
  testId = 'brand-boot-splash',
}: BrandBootSplashProps) {
  return (
    <div
      className={cn(
        'relative flex w-full flex-col items-center justify-center overflow-hidden bg-black select-none',
        variant === 'full' ? 'min-h-[100dvh]' : 'h-[var(--feed-card-h,100dvh)]',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      data-testid={testId}
      data-brand-boot="1"
      data-feed-boot={testId === 'feed-boot-splash' ? '1' : undefined}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(225,29,46,0.16)_0%,transparent_58%)]"
        aria-hidden
      />
      <BrandBootMark size="md" />
      <p className="brand-boot-splash__label mt-5 text-[0.8125rem] font-medium tracking-wide text-white/55">
        {label}
      </p>
    </div>
  )
}
