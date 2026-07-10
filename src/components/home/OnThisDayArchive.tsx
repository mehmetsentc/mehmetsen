'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar } from 'lucide-react'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface OnThisDayArchiveProps {
  /** Optional pre-fetched items; otherwise fetched client-side. */
  items?: NewsItem[]
}

export function OnThisDayArchive({ items: initialItems }: OnThisDayArchiveProps) {
  const [items, setItems] = useState<NewsItem[]>(initialItems ?? [])
  const [loading, setLoading] = useState(!initialItems)

  useEffect(() => {
    if (initialItems) return
    const now = new Date()
    const params = new URLSearchParams({
      month: String(now.getMonth() + 1),
      day: String(now.getDate()),
    })
    fetch(`/api/news/on-this-day?${params}`)
      .then((r) => r.json())
      .then((d: { items?: NewsItem[] }) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [initialItems])

  const todayLabel = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(
    new Date()
  )

  return (
    <section
      className="mb-8 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-5"
      aria-label="Tarihte bugün"
    >
      <div className="mb-4 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-[rgb(var(--color-brand))]" aria-hidden />
        <h2 className="text-base font-bold text-[rgb(var(--color-text))]">Tarihte Bugün — {todayLabel}</h2>
      </div>
      {loading ? (
        <ul className="space-y-2">
          {[1, 2, 3].map((i) => (
            <li key={i} className="h-4 animate-pulse rounded bg-[rgb(var(--color-border))]" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Bu tarihte arşiv haberi bulunamadı.</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((item) => (
            <li key={item.id}>
              <Link
                href={newsItemDetailHref(item)}
                className="text-sm font-medium text-[rgb(var(--color-text))] hover:text-[rgb(var(--color-brand))] hover:underline"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
