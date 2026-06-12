'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { usePageStateStore } from '@/store/pageStateStore'

const SCROLL_SAVE_MS = 120

/**
 * Saves scroll position per route and restores it on back-navigation.
 * Mount once inside the main app shell (MainLayoutClient).
 */
export function PageStateEffects() {
  const pathname = usePathname()
  const setScroll = usePageStateStore((s) => s.setScroll)
  const getScroll = usePageStateStore((s) => s.getScroll)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const saved = getScroll(pathname)
    window.scrollTo(0, saved)

    const onScroll = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        setScroll(pathname, window.scrollY)
      }, SCROLL_SAVE_MS)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      setScroll(pathname, window.scrollY)
    }
  }, [pathname, setScroll, getScroll])

  return null
}
