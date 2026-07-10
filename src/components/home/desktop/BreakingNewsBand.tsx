'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface BreakingNewsBandProps {
  items: NewsItem[]
}

/** Full-width red band above the breaking ticker. */
export function BreakingNewsBand({ items }: BreakingNewsBandProps) {
  if (items.length === 0) return null

  const lead = items[0]!

  return (
    <div
      className="mb-0 flex w-full items-stretch bg-red-600 text-white"
      role="region"
      aria-label="Son dakika bandı"
    >
      <Link
        href={ROUTES.CATEGORY('son-dakika')}
        className="flex shrink-0 items-center px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] transition-colors hover:bg-red-700"
      >
        Son Dakika
      </Link>
      <Link
        href={newsItemDetailHref(lead)}
        className="flex min-w-0 flex-1 items-center border-l border-red-500/60 px-4 py-2.5 transition-colors hover:bg-red-700/80"
      >
        <p className="m-0 truncate text-sm font-semibold">{lead.title}</p>
      </Link>
      {items.length > 1 ? (
        <span className="hidden shrink-0 items-center px-3 text-[11px] font-bold tabular-nums sm:flex">
          +{items.length - 1}
        </span>
      ) : null}
    </div>
  )
}
