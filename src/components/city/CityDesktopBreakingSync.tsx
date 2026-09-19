'use client'

import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import type { NewsItem } from '@/types/newsItem'

export function CityDesktopBreakingSync({ breakingItems }: { breakingItems: NewsItem[] }) {
  useScrollHeaderConfig({
    breakingItems,
    showBreaking: breakingItems.length > 0,
  })
  return null
}
