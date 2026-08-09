'use client'

import { Trophy } from 'lucide-react'
import { MobileFeedCardNews } from '@/components/feed/MobileFeedCard'
import type { NewsItem } from '@/types/newsItem'

interface CitySporClientProps {
  citySlug: string
  cityName: string
  initialItems: NewsItem[]
}

export function CitySporClient({
  citySlug,
  cityName,
  initialItems,
}: CitySporClientProps) {
  return (
    <div className="home-feed mx-auto w-full max-w-3xl pb-6 max-md:pb-10 max-md:pt-4">
      {initialItems.length > 0 ? (
        <div className="sd-feed">
          {initialItems.map((item, i) => (
            <MobileFeedCardNews key={item.id} item={item} priority={i === 0} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <Trophy className="mx-auto h-12 w-12 text-[rgb(var(--color-text-secondary))]/40" />
          <p className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
            Spor haberi bulunamadı.
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--color-text-secondary))]/70">
            {cityName} spor haberleri eklendikçe burada görünecek.
          </p>
        </div>
      )}
    </div>
  )
}
