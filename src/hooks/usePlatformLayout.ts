'use client'

import { useEffect, useState } from 'react'

export type Platform = 'mobile' | 'tablet' | 'desktop'

const QUERIES = {
  mobile: '(max-width: 767px)',
  tablet: '(min-width: 768px) and (max-width: 1023px)',
  desktop: '(min-width: 1024px)',
} as const

function detectPlatform(width: number): Platform {
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

function readPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop'
  const fromDom = document.documentElement.dataset.platform as Platform | undefined
  if (fromDom === 'mobile' || fromDom === 'tablet' || fromDom === 'desktop') {
    return fromDom
  }
  return detectPlatform(window.innerWidth)
}

function applyPlatform(platform: Platform) {
  document.documentElement.dataset.platform = platform
}

export function usePlatformLayout() {
  const [platform, setPlatform] = useState<Platform>(readPlatform)

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
