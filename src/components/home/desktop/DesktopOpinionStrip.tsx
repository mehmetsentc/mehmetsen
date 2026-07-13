'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { DESKTOP_SECTION_DIVIDER } from '@/components/home/desktop/desktopLayout'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { newsItemDetailHref, newsItemCategoryLabel } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

interface DesktopOpinionStripProps {
  items: NewsItem[]
}

function EditorialCard({ item }: { item: NewsItem }) {
  const catLabel = newsItemCategoryLabel(item)

  return (
    <article className="border-t-4 border-[rgb(var(--color-brand))] pt-4">
      {catLabel ? (
        <span className="mb-2 inline-block text-[11px] font-black uppercase tracking-[0.1em] text-[rgb(var(--color-brand))]">
          {catLabel}
        </span>
      ) : null}
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

/** Editöryal seçki — öne çıkan 3 haber, köşe yazısı stilinde. */
export function DesktopOpinionStrip({ items }: DesktopOpinionStripProps) {
  const cards = items.slice(0, 3)
  if (cards.length === 0) return null

  return (
    <section className={DESKTOP_SECTION_DIVIDER} aria-label="Editöryal seçki">
      <DesktopSectionHeader title="Editöryal Seçki" href={ROUTES.CATEGORY('gundem')} />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {cards.map((item) => (
          <EditorialCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}
