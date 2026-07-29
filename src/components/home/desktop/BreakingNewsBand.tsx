'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface BreakingNewsBandProps {
  items: NewsItem[]
}

/** Full-width red band — newsletter language under .desktop-newspaper. */
export function BreakingNewsBand({ items }: BreakingNewsBandProps) {
  if (items.length === 0) return null

  const lead = items[0]!

  return (
    <div className="nl-breaking-band mb-0" role="region" aria-label="Son dakika bandı">
      <Link href={ROUTES.CATEGORY('son-dakika')} className="nl-breaking-band__label">
        Son Dakika
      </Link>
      <Link href={newsItemDetailHref(lead)} className="nl-breaking-band__story">
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
