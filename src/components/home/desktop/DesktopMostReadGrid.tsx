'use client'

import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { DESKTOP_SECTION_DIVIDER, FOUR_CARD_GRID } from '@/components/home/desktop/desktopLayout'
import { NumberedStory } from '@/components/home/desktop/DesktopStoryBlocks'
import { ROUTES } from '@/constants/routes'
import type { NewsItem } from '@/types/newsItem'

interface DesktopMostReadGridProps {
  items: NewsItem[]
}

/** En çok okunanlar — sayfa genişliğinde 4 sütunlu sıralı başlık bandı. */
export function DesktopMostReadGrid({ items }: DesktopMostReadGridProps) {
  if (items.length === 0) return null

  return (
    <section
      className={DESKTOP_SECTION_DIVIDER}
      aria-label="Çok okunanlar"
    >
      <DesktopSectionHeader title="Çok Okunanlar" href={ROUTES.MOST_READ} />
      <div className={FOUR_CARD_GRID}>
        {items.map((item, index) => (
          <NumberedStory key={item.id} item={item} rank={index + 1} />
        ))}
      </div>
    </section>
  )
}
