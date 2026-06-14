'use client'

import dynamic from 'next/dynamic'
import type { FeedSliderItem } from '@/types/feedSlider'

const NewsSlider = dynamic(
  () => import('@/components/widgets/NewsSlider').then((m) => m.NewsSlider),
  { ssr: false, loading: () => null }
)

interface LazyNewsSliderProps {
  categoryId?: string
  initialItems?: FeedSliderItem[]
}

/** Carousel interactivity — deferred so server hero paints first (LCP). */
export function LazyNewsSlider({ categoryId, initialItems }: LazyNewsSliderProps) {
  return <NewsSlider categoryId={categoryId} initialItems={initialItems} replaceStaticHero />
}
