'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'
import { DESKTOP_SECTION_DIVIDER } from '@/components/home/desktop/desktopLayout'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { TextLeadStory } from '@/components/home/desktop/DesktopStoryBlocks'
import type { NewsItem } from '@/types/newsItem'

interface DesktopOpinionStripProps {
  items: NewsItem[]
}

/** Three editorial opinion cards on the home page. */
export function DesktopOpinionStrip({ items }: DesktopOpinionStripProps) {
  const cards = items.slice(0, 3)
  if (cards.length === 0) return null

  return (
    <section className={DESKTOP_SECTION_DIVIDER} aria-label="Görüş ve yorum">
      <DesktopSectionHeader title="Görüş & Yorum" href={ROUTES.CATEGORY('gundem')} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {cards.map((item) => (
          <article
            key={item.id}
            className="border-l-4 border-[rgb(var(--color-brand))] pl-4"
          >
            <TextLeadStory item={item} size="md" />
          </article>
        ))}
      </div>
    </section>
  )
}
