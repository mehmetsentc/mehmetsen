'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

interface DesktopBreakingTickerProps {
  items: NewsItem[]
}

const ROTATE_MS = 5000
const FADE_MS = 280

export function DesktopBreakingTicker({ items }: DesktopBreakingTickerProps) {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (items.length <= 1) return

    const interval = window.setInterval(() => {
      setVisible(false)
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % items.length)
        setVisible(true)
      }, FADE_MS)
    }, ROTATE_MS)

    return () => window.clearInterval(interval)
  }, [items.length])

  if (items.length === 0) return null

  const item = items[index] ?? items[0]!

  return (
    <div
      className="mb-4 flex h-9 overflow-hidden border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/25"
      aria-live="polite"
      aria-atomic="true"
    >
      <Link
        href={ROUTES.CATEGORY('son-dakika')}
        className="flex shrink-0 items-center bg-red-600 px-3 transition-colors hover:bg-red-700"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white">
          Son Dakika
        </span>
      </Link>

      <Link
        href={newsItemDetailHref(item)}
        className="flex min-w-0 flex-1 items-center gap-3 px-4"
        aria-label={`Son dakika: ${item.title}`}
      >
        <p
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-semibold text-[rgb(var(--color-text))] transition-opacity duration-300',
            visible ? 'opacity-100' : 'opacity-0'
          )}
        >
          {item.title}
        </p>
        {items.length > 1 ? (
          <span className="hidden shrink-0 text-[10px] font-bold tabular-nums text-red-600 sm:inline">
            {index + 1}/{items.length}
          </span>
        ) : null}
      </Link>
    </div>
  )
}
