'use client'

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * Shared mobile chrome authority: visual bottom of the fixed header+rail.
 * Use getBoundingClientRect().bottom (not a magic padding) so /feed content
 * starts at chromeBottom and /feed-v2 remaining-band matches the painted rail.
 */
export function useChromeOffset(enabled: boolean): {
  ref: RefObject<HTMLElement | null>
  height: number
} {
  const ref = useRef<HTMLElement | null>(null)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    if (!enabled) {
      setHeight(0)
      return
    }
    const el = ref.current
    if (!el) return

    const sync = () => {
      const box = el.getBoundingClientRect()
      const next = Math.max(0, Math.ceil(Math.max(box.height, box.bottom)))
      setHeight((prev) => (prev === next ? prev : next))
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('orientationchange', sync)
    window.visualViewport?.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [enabled])

  return { ref, height }
}
