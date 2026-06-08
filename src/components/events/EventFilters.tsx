'use client'

import { cn } from '@/lib/utils'
import { EVENT_CATEGORIES } from '@/lib/eventUtils'
import type { EventTimeRange } from '@/services/eventService'
import type { EventCategory } from '@/types/event'
import { EventCitySearch } from './EventCitySearch'

interface EventFiltersProps {
  selectedCitySlug: string | null
  onCityChange: (citySlug: string) => void
  onCityClear: () => void
  nearby?: boolean
  geoLoading?: boolean
  onToggleNearby?: () => void
  timeRange: EventTimeRange
  onTimeRangeChange: (range: EventTimeRange) => void
  selectedCategory: EventCategory | null
  onCategoryChange: (category: EventCategory | null) => void
}

export function EventFilters({
  selectedCitySlug,
  onCityChange,
  onCityClear,
  nearby,
  geoLoading,
  onToggleNearby,
  timeRange,
  onTimeRangeChange,
  selectedCategory,
  onCategoryChange,
}: EventFiltersProps) {
  return (
    <div className="space-y-3">
      <EventCitySearch
        selectedCitySlug={selectedCitySlug}
        onCityChange={onCityChange}
        onClear={onCityClear}
        nearby={nearby}
        geoLoading={geoLoading}
        onToggleNearby={onToggleNearby}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        <button
          type="button"
          onClick={() => onTimeRangeChange('upcoming')}
          className={cn('filter-chip', timeRange === 'upcoming' && 'filter-chip-active')}
        >
          Yaklaşan
        </button>
        <button
          type="button"
          onClick={() => onTimeRangeChange('past')}
          className={cn('filter-chip', timeRange === 'past' && 'filter-chip-active')}
        >
          Geçmiş
        </button>
      </div>

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
