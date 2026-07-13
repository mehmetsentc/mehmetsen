'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { DESKTOP_SECTION_DIVIDER } from '@/components/home/desktop/desktopLayout'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface DesktopOpinionStripProps {
  items: NewsItem[]
}

function AuthorAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-sm font-black text-white"
      aria-hidden
    >
      {initials || '?'}
    </div>
  )
}

function OpinionCard({ item }: { item: NewsItem }) {
  const authorName = item.author ?? item.source ?? 'NaHaber'

  return (
    <article className="flex flex-col gap-3 border-t-4 border-[rgb(var(--color-brand))] pt-4">
      {/* Yazar satırı */}
      <div className="flex items-center gap-3">
        <AuthorAvatar name={authorName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[rgb(var(--color-text))]">{authorName}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--color-brand))]">
            Köşe Yazısı
          </p>
        </div>
      </div>

      {/* Başlık */}
      <Link href={newsItemDetailHref(item)} className="group block min-w-0">
        <h3 className="font-serif text-base font-bold leading-snug text-[rgb(var(--color-text))] decoration-2 underline-offset-2 group-hover:underline">
          {item.title}
        </h3>
        {item.description ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
            {item.description}
          </p>
        ) : null}
      </Link>
    </article>
  )
}

/** Three editorial opinion cards on the home page — NYT köşe yazısı stili. */
export function DesktopOpinionStrip({ items }: DesktopOpinionStripProps) {
  const cards = items.slice(0, 3)
  if (cards.length === 0) return null

  return (
    <section className={DESKTOP_SECTION_DIVIDER} aria-label="Görüş ve yorum">
      <DesktopSectionHeader title="Görüş & Yorum" href={ROUTES.CATEGORY('gundem')} />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {cards.map((item) => (
          <OpinionCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}
