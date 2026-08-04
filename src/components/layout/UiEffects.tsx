'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useUiStore } from '@/store/uiStore'
import { ROUTES } from '@/constants/routes'

function hasDesktopWebHeader(pathname: string): boolean {
  if (pathname === ROUTES.REELS) return false
  if (pathname.startsWith('/messages')) return false
  if (pathname.startsWith('/admin')) return false
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) return false
  if (pathname.startsWith('/search') || pathname.startsWith('/ara')) return false
  if (pathname.startsWith('/saved') || pathname.startsWith('/settings')) return false
  if (pathname.startsWith('/notifications') || pathname.startsWith('/oyunlar')) return false
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
      ? 'concept-b'
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
