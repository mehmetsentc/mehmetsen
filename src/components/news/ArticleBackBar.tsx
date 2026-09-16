'use client'

/**
 * Always-visible back control for canonical /haber on mobile.
 * Site Navbar also has BackNavButton; this belt covers Lift overlays and
 * cases where smart-feed-reader-open incorrectly hides .mobile-top-chrome.
 */
import { BackNavButton } from '@/components/layout/BackNavButton'
import { ROUTES } from '@/constants/routes'

export function ArticleBackBar() {
  return (
    <div
      className="sticky top-0 z-[90] flex items-center gap-2 border-b border-[color:var(--reader-page-edge,rgb(var(--color-border)))] bg-[color:var(--reader-page-bg,rgb(var(--color-bg)))] px-2 pb-2 pt-[max(0.5rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.35rem))] lg:hidden"
      data-testid="article-back-bar"
    >
      <BackNavButton
        className="back-nav-btn--navbar !text-[color:var(--reader-page-text,rgb(var(--color-text)))] hover:!bg-white/10"
        fallbackHref={ROUTES.FEED}
      />
      <span className="text-sm font-semibold text-[color:var(--reader-page-text,rgb(var(--color-text)))]">
        Geri
      </span>
    </div>
  )
}
