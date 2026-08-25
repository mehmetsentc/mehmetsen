'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { usePageStateStore } from '@/store/pageStateStore'

const SCROLL_SAVE_MS = 120

/**
 * Saves scroll position per route and restores it on back-navigation.
 * Mount once inside the main app shell (MainLayoutClient).
 *
 * Uses double-RAF so the restore fires after the page has painted —
 * otherwise Next.js App Router may reset scroll after our first scrollTo.
 */
export function PageStateEffects() {
  const pathname = usePathname()
  const setScroll = usePageStateStore((s) => s.setScroll)
  const getScroll = usePageStateStore((s) => s.getScroll)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const saved = getScroll(pathname)

    // Cancel any pending restore from a previous route
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)

    if (saved > 0) {
      // Double-RAF: first frame lets React commit the new tree,
      // second frame fires after the browser has painted it.
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          window.scrollTo({ top: saved, behavior: 'instant' })
        })
      })
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }

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
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      setScroll(pathname, window.scrollY)
    }
  }, [pathname, setScroll, getScroll])

  return null
}
