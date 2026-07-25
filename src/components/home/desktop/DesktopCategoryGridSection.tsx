'use client'

import { ROUTES } from '@/constants/routes'
import { DESKTOP_SECTION_DIVIDER, FOUR_CARD_GRID } from '@/components/home/desktop/desktopLayout'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { ImageStory } from '@/components/home/desktop/DesktopStoryBlocks'
import { getCategoryAccentColor } from '@/lib/categoryAccent'
import { HOME_CATEGORY_DESKTOP_CARDS } from '@/types/newsItem'
import type { NewsItem } from '@/types/newsItem'

interface DesktopCategoryGridSectionProps {
  categoryId: string
  title: string
  items: NewsItem[]
  href?: string
}

export function DesktopCategoryGridSection({
  categoryId,
  title,
  items,
  href,
}: DesktopCategoryGridSectionProps) {
  const cards = items.slice(0, HOME_CATEGORY_DESKTOP_CARDS)
  if (cards.length === 0) return null

  const accent = getCategoryAccentColor(categoryId)

  return (
    <section
      className={DESKTOP_SECTION_DIVIDER}
      aria-label={title}
      style={{ borderTopWidth: 3, borderTopStyle: 'solid', borderTopColor: accent }}
    >
      <DesktopSectionHeader title={title} href={href ?? ROUTES.CATEGORY(categoryId)} />
      <div className={FOUR_CARD_GRID}>
        {cards.map((item) => (
          <ImageStory key={item.id} item={item} aspect="video" />
        ))}
      </div>
    </section>
  )
}
