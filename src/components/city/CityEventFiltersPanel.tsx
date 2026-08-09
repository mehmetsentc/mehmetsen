'use client'

import { cn } from '@/lib/utils'
import { EVENT_CATEGORIES } from '@/lib/eventUtils'
import type { CityEventDateFilter, CityEventFilterState } from '@/lib/cityEventFilters'

const DATE_OPTIONS: Array<{ id: CityEventDateFilter; label: string }> = [
  { id: 'all', label: 'Tümü' },
  { id: 'today', label: 'Bugün' },
  { id: 'tomorrow', label: 'Yarın' },
  { id: 'thisWeek', label: 'Bu Hafta' },
]

interface CityEventFiltersPanelProps {
  filters: CityEventFilterState
  onChange: (next: CityEventFilterState) => void
  venueOptions: string[]
  districtOptions: Array<{ slug: string; name: string }>
  onReset?: () => void
  className?: string
}

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-[rgb(var(--color-border))] py-4 last:border-b-0">
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-text-secondary))]">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-[rgb(var(--color-brand))] text-white shadow-sm'
          : 'bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text-secondary))] ring-1 ring-[rgb(var(--color-border))] hover:text-[rgb(var(--color-text))]'
      )}
    >
      {children}
    </button>
  )
}

export function CityEventFiltersPanel({
  filters,
  onChange,
  venueOptions,
  districtOptions,
  onReset,
  className,
}: CityEventFiltersPanelProps) {
  const set = (patch: Partial<CityEventFilterState>) =>
    onChange({ ...filters, ...patch })

  return (
    <div className={cn('flex flex-col', className)}>
      <FilterSection title="Tarih">
        <div className="flex flex-wrap gap-2">
          {DATE_OPTIONS.map((opt) => (
            <Chip
              key={opt.id}
              active={filters.dateFilter === opt.id}
              onClick={() => set({ dateFilter: opt.id })}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Kategori">
        <div className="flex flex-wrap gap-2">
          <Chip active={!filters.category} onClick={() => set({ category: null })}>
            Tümü
          </Chip>
          {EVENT_CATEGORIES.map((cat) => (
            <Chip
              key={cat.id}
              active={filters.category === cat.id}
              onClick={() => set({ category: cat.id })}
            >
              {cat.label}
            </Chip>
          ))}
        </div>
      </FilterSection>

      {venueOptions.length > 0 && (
        <FilterSection title="Mekan">
          <div className="max-h-40 space-y-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => set({ venue: null })}
              className={cn(
                'block w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                !filters.venue
                  ? 'bg-[rgb(var(--color-brand))]/10 font-semibold text-[rgb(var(--color-brand))]'
                  : 'text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-raised))]'
              )}
            >
              Tüm mekanlar
            </button>
            {venueOptions.map((venue) => (
              <button
                key={venue}
                type="button"
                onClick={() => set({ venue })}
                className={cn(
                  'block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  filters.venue === venue
                    ? 'bg-[rgb(var(--color-brand))]/10 font-semibold text-[rgb(var(--color-brand))]'
                    : 'text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-raised))]'
                )}
              >
                {venue}
              </button>
            ))}
          </div>
        </FilterSection>
      )}

      {districtOptions.length > 0 && (
        <FilterSection title="İlçe">
          <div className="flex flex-wrap gap-2">
            <Chip
              active={!filters.districtSlug}
              onClick={() => set({ districtSlug: null })}
            >
              Tümü
            </Chip>
            {districtOptions.map((d) => (
              <Chip
                key={d.slug}
                active={filters.districtSlug === d.slug}
                onClick={() => set({ districtSlug: d.slug })}
              >
                {d.name}
              </Chip>
            ))}
          </div>
        </FilterSection>
      )}

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-2 text-sm font-semibold text-[rgb(var(--color-brand))] hover:underline"
        >
          Filtreleri temizle
        </button>
      )}
    </div>
  )
}
