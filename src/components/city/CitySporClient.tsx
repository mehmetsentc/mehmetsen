'use client'

import { Trophy } from 'lucide-react'
import { CityNewsItem } from './CityNewsItem'
import { CityNewsList } from './CityNewsList'
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
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">
        {cityName} Spor
      </h1>

      {initialItems.length > 0 ? (
        <div className="divide-y divide-[rgb(var(--color-border))]">
          {initialItems.map((item, i) => (
            <CityNewsItem key={item.id} item={item} priority={i < 3} />
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
