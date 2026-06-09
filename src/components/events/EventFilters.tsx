'use client'

import { cn } from '@/lib/utils'
import { EVENT_CATEGORIES } from '@/lib/eventUtils'
import type { EventCategory } from '@/types/event'
import { EventCitySearch } from './EventCitySearch'

interface EventFiltersProps {
  selectedCitySlug: string | null
  onCityChange: (citySlug: string) => void
  onCityClear: () => void
  selectedCategory: EventCategory | null
  onCategoryChange: (category: EventCategory | null) => void
  geoLoading?: boolean
}

export function EventFilters({
  selectedCitySlug,
  onCityChange,
  onCityClear,
  selectedCategory,
  onCategoryChange,
  geoLoading,
}: EventFiltersProps) {
  return (
    <div className="space-y-3">
      <EventCitySearch
        selectedCitySlug={selectedCitySlug}
        onCityChange={onCityChange}
        onClear={onCityClear}
        disabled={geoLoading}
        placeholder={geoLoading ? 'Konum alınıyor...' : 'Şehir ara...'}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          className={cn('filter-chip', selectedCategory === null && 'filter-chip-active')}
        >
          Tümü
        </button>
        {EVENT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onCategoryChange(cat.id)}
            className={cn('filter-chip', selectedCategory === cat.id && 'filter-chip-active')}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  )
}
