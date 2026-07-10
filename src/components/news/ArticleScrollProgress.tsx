'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * ArticleScrollProgress — F2
 *
 * Sayfanın en üstüne sabit bir okuma ilerleme çubuğu (Apple News / Medium tarzı).
 * Tek bir scroll listener + rAF throttling kullanır.
 */
export function ArticleScrollProgress() {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const compute = () => {
      const doc = document.documentElement
      const scrollTop = window.scrollY || doc.scrollTop
      const max = doc.scrollHeight - doc.clientHeight
      const pct = max > 0 ? Math.min(100, Math.max(0, (scrollTop / max) * 100)) : 0
      setProgress(pct)
    }

    const onScroll = () => {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        compute()
        rafRef.current = null
      })
    }

    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]"
      aria-hidden
    >
      <div
        className="h-full origin-left bg-brand-500 shadow-[0_0_8px_rgb(var(--brand-500)/0.55)]"
        style={{
          transform: `scaleX(${progress / 100})`,
          transition: 'transform 90ms linear',
        }}
      />
    </div>
  )
}
