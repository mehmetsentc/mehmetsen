'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface LatestItem {
  id: string
  title: string
  href: string
}

interface MobileLatestStripProps {
  items: LatestItem[]
  className?: string
}

/**
 * Gentle horizontal "Güncel" strip. Pauses auto-advance on interaction.
 * Respects prefers-reduced-motion.
 */
export function MobileLatestStrip({ items, className }: MobileLatestStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (items.length < 3 || paused) return
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const el = scrollerRef.current
    if (!el) return

    const id = window.setInterval(() => {
      if (!el || paused) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      const next = el.scrollLeft + 160
      if (next >= max - 8) {
        el.scrollTo({ left: 0, behavior: 'smooth' })
      } else {
        el.scrollBy({ left: 160, behavior: 'smooth' })
      }
    }, 4500)

    return () => window.clearInterval(id)
  }, [items.length, paused])

  if (items.length < 2) return null

  return (
    <div
      className={cn('mc-latest', className)}
      onPointerDown={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
    >
      <span className="mc-latest__label">Güncel</span>
      <div
        ref={scrollerRef}
        className="mc-latest__scroller scrollbar-hide"
        data-no-category-swipe
      >
        {items.map((item, i) => (
          <span key={item.id} className="mc-latest__item">
            {i > 0 ? <span className="mc-latest__dot" aria-hidden>•</span> : null}
            <Link href={item.href} className="mc-latest__link">
              {item.title}
            </Link>
          </span>
        ))}
      </div>
    </div>
  )
}
