'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { getLiftReaderOrigin } from '@/lib/articleLift/liftOrigin'
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
    const liftOrigin = getLiftReaderOrigin()
    const liftArticlePath =
      !!liftOrigin && (pathname === '/haber' || pathname.startsWith('/haber/'))

    // Article Lift intercepts /haber/* on top of the still-mounted origin
    // page. Saving window.scrollY here (after Next/Link + overflow mutate
    // the document) wrote document.scrollHeight onto /feed and returned
    // readers to the footer. Re-pin the click-time origin and do not move
    // the underlying page. Feed2 never captures a lift origin, so this
    // branch does not run on /feed-v2.
    if (liftArticlePath && liftOrigin) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      setScroll(liftOrigin.pathname, liftOrigin.scrollY)
      return () => {
        setScroll(liftOrigin.pathname, liftOrigin.scrollY)
      }
    }

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
        const origin = getLiftReaderOrigin()
        if (origin && origin.pathname === pathname) {
          setScroll(pathname, origin.scrollY)
        } else {
          setScroll(pathname, window.scrollY)
        }
      }, SCROLL_SAVE_MS)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      const origin = getLiftReaderOrigin()
      if (origin && origin.pathname === pathname) {
        setScroll(pathname, origin.scrollY)
      } else {
        setScroll(pathname, window.scrollY)
      }
    }
  }, [pathname, setScroll, getScroll])

  return null
}
