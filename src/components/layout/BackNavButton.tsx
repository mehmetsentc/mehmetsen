'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const HIDDEN_PREFIXES = [
  ROUTES.LOGIN,
  ROUTES.REGISTER,
  ROUTES.ONBOARDING,
  '/admin',
]

function shouldHideBack(pathname: string): boolean {
  if (pathname === ROUTES.FEED || pathname === ROUTES.HOME || pathname === '/') return true
  return HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function resolveFallback(pathname: string): string {
  if (pathname.startsWith('/kategori/')) {
    const parts = pathname.split('/').filter(Boolean)
    // /kategori/spor/futbol → parent category; /kategori/dunya → feed
    if (parts.length >= 3) return ROUTES.CATEGORY(parts[1]!)
    return ROUTES.FEED
  }
  if (pathname.startsWith('/haber/') || pathname.startsWith('/post/')) return ROUTES.FEED
  if (pathname === ROUTES.REELS || pathname.startsWith(`${ROUTES.REELS}?`)) return ROUTES.FEED
  // Immersive Smart Feed — always fall back to NaHaber home (not classic /feed).
  if (pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')) return ROUTES.HOME
  if (pathname.startsWith('/settings')) return ROUTES.SETTINGS
  return ROUTES.FEED
}

interface BackNavButtonProps {
  className?: string
  fallbackHref?: string
  /** Force light-on-dark styling (reels). */
  tone?: 'auto' | 'dark' | 'light'
}

/**
 * Smart back control: same-origin history → router.back(), else fallback route.
 */
export function BackNavButton({
  className,
  fallbackHref,
  tone = 'auto',
}: BackNavButtonProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (window.history.length > 1 && document.referrer) {
        const ref = new URL(document.referrer)
        setCanGoBack(ref.origin === window.location.origin)
        return
      }
      // Soft-nav within the SPA usually leaves history entries.
      setCanGoBack(window.history.length > 1)
    } catch {
      setCanGoBack(false)
    }
  }, [pathname])

  const fallback = fallbackHref ?? resolveFallback(pathname)

  const onClick = useCallback(() => {
    if (canGoBack) {
      router.back()
      return
    }
    router.push(fallback)
  }, [canGoBack, router, fallback])

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Geri"
      title="Geri"
      className={cn(
        'back-nav-btn',
        tone === 'dark' && 'back-nav-btn--dark',
        tone === 'light' && 'back-nav-btn--light',
        className
      )}
    >
      <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
    </button>
  )
}

/** Fixed global back control for immersive routes (reels / feed-v2) and desktop chrome. */
export function GlobalBackNav() {
  const pathname = usePathname()
  const hidden = useMemo(() => shouldHideBack(pathname), [pathname])
  const isImmersive =
    pathname === ROUTES.REELS ||
    pathname === '/feed-v2' ||
    pathname.startsWith('/feed-v2/')

  if (hidden) return null

  return (
    <div
      className={cn(
        'back-nav-global',
        // Mobile non-immersive: Navbar already has back. Desktop + immersive: floating.
        isImmersive ? 'back-nav-global--reels' : 'back-nav-global--desktop'
      )}
      data-testid={isImmersive ? 'smart-feed-exit-nav' : undefined}
    >
      <BackNavButton
        tone={isImmersive ? 'dark' : 'auto'}
        fallbackHref={isImmersive ? ROUTES.HOME : undefined}
      />
    </div>
  )
}
