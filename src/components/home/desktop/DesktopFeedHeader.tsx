'use client'

import { DesktopWebHeader } from '@/components/home/desktop/DesktopWebHeader'
import type { NewsItem } from '@/types/newsItem'

interface DesktopFeedHeaderProps {
  breakingItems: NewsItem[]
}

export function DesktopFeedHeader({ breakingItems }: DesktopFeedHeaderProps) {
  return <DesktopWebHeader breakingItems={breakingItems} showBreaking />
}
