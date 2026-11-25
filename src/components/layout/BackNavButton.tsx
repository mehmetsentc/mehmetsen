'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Home } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { isGlobalNavV2EnabledClient } from '@/lib/feed/featureFlagClient'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { isNewspaperDesktopVideo } from '@/lib/feed/reader/shellChrome'

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
  // Header “Video” sekmesinden gelinir — geri dönüş ana sayfa (gazete).
  if (pathname === ROUTES.VIDEO || pathname.startsWith(`${ROUTES.VIDEO}/`)) return ROUTES.HOME
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
  const { isDesktop } = usePlatformLayout()
  const hidden = useMemo(() => shouldHideBack(pathname), [pathname])
  const isFeedV2 = pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')
  const isReels =
    pathname === ROUTES.REELS || pathname.startsWith(`${ROUTES.REELS}/`)
  const isPublicVideo =
    pathname === ROUTES.VIDEO || pathname.startsWith(`${ROUTES.VIDEO}/`)
  const globalNavV2 = isGlobalNavV2EnabledClient()

  const isImmersive = isReels || isPublicVideo || isFeedV2

  // Newspaper desktop has masthead; only immersive routes keep a floating control.
  if (hidden || !isImmersive) return null
  // Masaüstü /video yalnızca gazete düzeninde (geri alma anahtarı) masthead'e sahip;
  // varsayılan tam ekran oynatıcıda geri + ana sayfa denetimi gerekir.
  if (isPublicVideo && isNewspaperDesktopVideo(pathname, isDesktop)) return null
  if (globalNavV2 && isFeedV2) return null

  return (
    <div
      className={cn('back-nav-global', 'back-nav-global--reels')}
      data-testid={isImmersive ? 'smart-feed-exit-nav' : undefined}
    >
      <BackNavButton
        tone={isImmersive ? 'dark' : 'auto'}
        fallbackHref={
          isFeedV2 || isPublicVideo ? ROUTES.HOME : isImmersive ? ROUTES.FEED : undefined
        }
      />
      {isPublicVideo ? (
        <Link
          href={ROUTES.HOME}
          aria-label="Ana sayfa"
          title="Ana sayfa"
          className="back-nav-btn back-nav-btn--dark back-nav-home"
          data-testid="video-home-link"
        >
          <Home className="h-5 w-5" strokeWidth={2.25} />
        </Link>
      ) : null}
    </div>
  )
}
