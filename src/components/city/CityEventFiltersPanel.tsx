'use client'

import { cn } from '@/lib/utils'
import type { EventCategory } from '@/types/event'
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
  categoryOptions: Array<{ id: EventCategory; label: string }>
  venueOptions: string[]
  districtOptions: Array<{ slug: string; name: string }>
  onReset?: () => void
  className?: string
  /** Hide category section when quick chips are shown elsewhere (mobile bar). */
  hideCategorySection?: boolean
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
  size = 'default',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  size?: 'default' | 'compact'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full font-medium transition-colors',
        size === 'compact' ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-sm',
        active
          ? 'bg-[rgb(var(--color-brand))] text-white shadow-sm'
          : 'bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text-secondary))] ring-1 ring-[rgb(var(--color-border))] hover:text-[rgb(var(--color-text))]'
      )}
    >
      {children}
    </button>
  )
}

interface CityEventQuickFiltersProps {
  filters: CityEventFilterState
  onChange: (next: CityEventFilterState) => void
  categoryOptions: Array<{ id: EventCategory; label: string }>
  /** Show date chips alongside categories (tablet bar). */
  showDateFilters?: boolean
  className?: string
}

/** Horizontal quick-filter chips for mobile sticky bar and tablet top bar. */
export function CityEventQuickFilters({
  filters,
  onChange,
  categoryOptions,
  showDateFilters = false,
  className,
}: CityEventQuickFiltersProps) {
  const set = (patch: Partial<CityEventFilterState>) =>
    onChange({ ...filters, ...patch })

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {showDateFilters && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-hide"
          role="group"
          aria-label="Tarih filtresi"
        >
          {DATE_OPTIONS.map((opt) => (
            <Chip
              key={opt.id}
              active={filters.dateFilter === opt.id}
              onClick={() => set({ dateFilter: opt.id })}
              size="compact"
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      )}
      {categoryOptions.length > 0 && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-hide"
          role="group"
          aria-label="Kategori filtresi"
        >
          <Chip
            active={!filters.category}
            onClick={() => set({ category: null })}
            size="compact"
          >
            Tümü
          </Chip>
          {categoryOptions.map((cat) => (
            <Chip
              key={cat.id}
              active={filters.category === cat.id}
              onClick={() => set({ category: cat.id })}
              size="compact"
            >
              {cat.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}

export function CityEventFiltersPanel({
  filters,
  onChange,
  categoryOptions,
  venueOptions,
  districtOptions,
  onReset,
  className,
  hideCategorySection = false,
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

      {!hideCategorySection && categoryOptions.length > 0 && (
        <FilterSection title="Kategori">
          <div className="flex flex-wrap gap-2">
            <Chip active={!filters.category} onClick={() => set({ category: null })}>
              Tümü
            </Chip>
            {categoryOptions.map((cat) => (
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
      )}

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
