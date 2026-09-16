'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useUiStore } from '@/store/uiStore'
import { pathIs, ROUTES } from '@/constants/routes'

function hasDesktopWebHeader(pathname: string): boolean {
  if (pathname === ROUTES.REELS || pathname.startsWith(`${ROUTES.REELS}/`)) return false
  if (pathIs(pathname, ROUTES.MESSAGES, '/messages')) return false
  if (pathname.startsWith('/admin')) return false
  if (pathIs(pathname, ROUTES.LOGIN, '/login', ROUTES.REGISTER, '/register', '/onboarding')) {
    return false
  }
  if (pathIs(pathname, ROUTES.SAVED, '/saved', ROUTES.SETTINGS, '/settings')) return false
  if (pathIs(pathname, ROUTES.NOTIFICATIONS, '/notifications')) return false
  return true
}

/**
 * Global UI side-effects: close mobile drawer on route change, wire feed policy event.
 */
export function UiEffects() {
  const pathname = usePathname()
  const setMobileDrawerOpen = useUiStore((s) => s.setMobileDrawerOpen)
  const setFeedPolicyOpen = useUiStore((s) => s.setFeedPolicyOpen)
  const desktopSidebarOpen = useUiStore((s) => s.desktopSidebarOpen)

  useEffect(() => {
    document.documentElement.dataset.sidebar = desktopSidebarOpen ? 'open' : 'closed'
  }, [desktopSidebarOpen])

  useEffect(() => {
    document.documentElement.dataset.desktopHeader = hasDesktopWebHeader(pathname)
      ? 'newspaper'
      : 'none'
  }, [pathname])

  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [pathname, setMobileDrawerOpen])

  useEffect(() => {
    const onOpenPolicy = () => setFeedPolicyOpen(true)
    window.addEventListener('openFeedPolicy', onOpenPolicy)
    return () => window.removeEventListener('openFeedPolicy', onOpenPolicy)
  }, [setFeedPolicyOpen])

  return null
}
