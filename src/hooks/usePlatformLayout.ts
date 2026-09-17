'use client'

import { useEffect, useState } from 'react'

export type Platform = 'mobile' | 'tablet' | 'desktop'

const QUERIES = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
} as const

function applyPlatform(platform: Platform) {
  document.documentElement.dataset.platform = platform
}

export function usePlatformLayout() {
  // SSR always renders `desktop`. Do NOT read `window` / `data-platform` in the
  // initial state — ThemeScript may set a different platform before hydrate and
  // that mismatch triggers Recoverable Hydration Error (and flaky Feed mounts).
  const [platform, setPlatform] = useState<Platform>('desktop')

  useEffect(() => {
    const mobile = window.matchMedia(QUERIES.mobile)
    const tablet = window.matchMedia(QUERIES.tablet)
    const desktop = window.matchMedia(QUERIES.desktop)

    const sync = () => {
      const next = desktop.matches ? 'desktop' : tablet.matches ? 'tablet' : 'mobile'
      setPlatform(next)
      applyPlatform(next)
    }

    sync()
    mobile.addEventListener('change', sync)
    tablet.addEventListener('change', sync)
    desktop.addEventListener('change', sync)

    return () => {
      mobile.removeEventListener('change', sync)
      tablet.removeEventListener('change', sync)
      desktop.removeEventListener('change', sync)
    }
  }, [])

  return {
    platform,
    isMobile: platform === 'mobile',
    isTablet: platform === 'tablet',
    isDesktop: platform === 'desktop',
  }
}
