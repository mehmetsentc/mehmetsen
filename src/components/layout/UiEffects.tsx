'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useUiStore } from '@/store/uiStore'

/**
 * Global UI side-effects: close mobile drawer on route change, wire feed policy event.
 */
export function UiEffects() {
  const pathname = usePathname()
  const setMobileDrawerOpen = useUiStore((s) => s.setMobileDrawerOpen)
  const setFeedPolicyOpen = useUiStore((s) => s.setFeedPolicyOpen)

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
