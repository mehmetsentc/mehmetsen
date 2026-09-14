'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatNewsClockTime } from '@/components/home/desktop/formatNewsDate'
import { ROUTES } from '@/constants/routes'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

interface DesktopBreakingTickerProps {
  items: NewsItem[]
  variant?: 'default' | 'portal'
}

const ROTATE_MS = 5000
const FADE_MS = 280

export function DesktopBreakingTicker({
  items,
  variant = 'default',
}: DesktopBreakingTickerProps) {
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
  const clock = formatNewsClockTime(item.publishedAt ?? item.createdAt)

  const go = (dir: -1 | 1) => {
    if (items.length <= 1) return
    setVisible(false)
    window.setTimeout(() => {
      setIndex((current) => (current + dir + items.length) % items.length)
      setVisible(true)
    }, FADE_MS)
  }

  if (variant === 'portal') {
    return (
      <div
        className="desktop-portal-breaking"
        aria-live="polite"
        aria-atomic="true"
        data-testid="desktop-portal-breaking"
      >
        <div className="desktop-web-header__inner desktop-portal-breaking__inner">
          <Link href={ROUTES.CATEGORY('son-dakika')} className="desktop-portal-breaking__label">
            Son dakika
          </Link>
          <Link
            href={newsItemDetailHref(item)}
            className="desktop-portal-breaking__story"
            aria-label={`Son dakika: ${item.title}`}
          >
            {clock ? <span className="desktop-portal-breaking__time">{clock}</span> : null}
            <span
              className={cn(
                'min-w-0 flex-1 truncate transition-opacity duration-300',
                visible ? 'opacity-100' : 'opacity-0'
              )}
            >
              {item.title}
            </span>
          </Link>
          {items.length > 1 ? (
            <div className="desktop-portal-breaking__controls">
              <button type="button" onClick={() => go(-1)} aria-label="Önceki son dakika">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Sonraki son dakika">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="nl-breaking-ticker mb-4" aria-live="polite" aria-atomic="true">
      <Link href={ROUTES.CATEGORY('son-dakika')} className="nl-breaking-ticker__label">
        Son Dakika
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
          <span className="hidden shrink-0 text-[10px] font-bold tabular-nums text-[rgb(var(--color-brand))] sm:inline">
            {index + 1}/{items.length}
          </span>
        ) : null}
      </Link>
    </div>
  )
}
