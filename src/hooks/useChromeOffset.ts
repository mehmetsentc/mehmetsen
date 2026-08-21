'use client'

import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Measure fixed top-chrome height for a layout spacer (avoids content jump). */
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
      const next = Math.ceil(el.getBoundingClientRect().height)
      setHeight((prev) => (prev === next ? prev : next))
    }

    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('orientationchange', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', sync)
    }
  }, [enabled])

  return { ref, height }
}
