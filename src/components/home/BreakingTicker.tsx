'use client'

import Link from 'next/link'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface BreakingTickerProps {
  items: NewsItem[]
}

export function BreakingTicker({ items }: BreakingTickerProps) {
  if (items.length === 0) return null

  const lead = items[0]!

  return (
    <Link
      href={newsItemDetailHref(lead)}
      className="home-full-bleed flex h-11 overflow-hidden md:home-contained md:rounded-xl"
      aria-label={`Son dakika: ${lead.title}`}
    >
      <div className="flex shrink-0 items-center bg-black px-3">
        <span className="text-[11px] font-black uppercase tracking-widest text-white">Son Dakika</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center overflow-hidden bg-[rgb(var(--color-brand))] px-3">
        <p className="animate-marquee whitespace-nowrap text-sm font-bold text-white">
          {lead.title}
        </p>
      </div>
    </Link>
  )
}
