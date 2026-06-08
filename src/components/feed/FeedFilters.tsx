'use client'

import { DEFAULT_CATEGORIES } from '@/constants/config'
import { CITY_CATEGORIES } from '@/constants/cities'
import type { FeedCity } from '@/hooks/useRecentCities'
import { cn } from '@/lib/utils'

interface FeedFiltersProps {
  selected: string | null
  onChange: (categoryId: string | null) => void
  cities: FeedCity[]
  citiesLoading?: boolean
}

export function FeedFilters({ selected, onChange, cities, citiesLoading }: FeedFiltersProps) {
  const cityFilters = cities.length > 0 ? cities : citiesLoading ? [] : [...CITY_CATEGORIES]

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn('filter-chip', selected === null && 'filter-chip-active')}
        >
          Tümü
        </button>
        {DEFAULT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChange(cat.id)}
            className={cn('filter-chip', selected === cat.id && 'filter-chip-active')}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {citiesLoading && cityFilters.length === 0 ? (
          [...Array(4)].map((_, i) => (
            <span
              key={`city-sk-${i}`}
              className="filter-chip h-8 w-20 shrink-0 animate-pulse bg-[rgb(var(--color-surface-elevated))]"
              aria-hidden
            />
          ))
        ) : (
          cityFilters.map((city) => (
            <button
              key={city.id}
              type="button"
              onClick={() => onChange(city.id)}
              className={cn('filter-chip', selected === city.id && 'filter-chip-active')}
            >
              {city.name}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
