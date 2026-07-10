'use client'

import { DesktopScrollHeader } from '@/components/home/desktop/DesktopScrollHeader'
import type { NewsItem } from '@/types/newsItem'

interface DesktopFeedHeaderProps {
  breakingItems: NewsItem[]
}

export function DesktopFeedHeader({ breakingItems }: DesktopFeedHeaderProps) {
  return <DesktopScrollHeader breakingItems={breakingItems} showBreaking />
}
