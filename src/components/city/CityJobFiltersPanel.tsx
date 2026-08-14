'use client'

import { cn } from '@/lib/utils'
import {
  CITYWIDE_DISTRICT_SLUG,
  type CityJobFilterState,
  type JobCategoryId,
} from '@/lib/cityJobFilters'
import type { JobListingSource } from '@/types/jobListing'

interface CityJobFiltersPanelProps {
  filters: CityJobFilterState
  onChange: (next: CityJobFilterState) => void
  categoryOptions: Array<{ id: JobCategoryId; label: string; count: number }>
  districtOptions: Array<{ slug: string; name: string; count: number }>
  sourceOptions: Array<{ id: JobListingSource; label: string; count: number }>
  workTypeOptions: string[]
  onReset?: () => void
  className?: string
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
  muted,
  size = 'default',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  muted?: boolean
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
          : muted
            ? 'bg-[rgb(var(--color-surface-raised))]/60 text-[rgb(var(--color-muted))] ring-1 ring-[rgb(var(--color-border))]/70'
            : 'bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text-secondary))] ring-1 ring-[rgb(var(--color-border))] hover:text-[rgb(var(--color-text))]'
      )}
    >
      {children}
    </button>
  )
}

export function CityJobFiltersPanel({
  filters,
  onChange,
  categoryOptions,
  districtOptions,
  sourceOptions,
  workTypeOptions,
  onReset,
  className,
  hideCategorySection,
}: CityJobFiltersPanelProps) {
  const set = (patch: Partial<CityJobFilterState>) => onChange({ ...filters, ...patch })

  const merkez = districtOptions.find((d) => d.slug === 'merkez')
  const citywide = districtOptions.find((d) => d.slug === CITYWIDE_DISTRICT_SLUG)
  const otherDistricts = districtOptions.filter(
    (d) => d.slug !== 'merkez' && d.slug !== CITYWIDE_DISTRICT_SLUG
  )

  return (
    <div className={cn('text-[rgb(var(--color-text))]', className)}>
      {!hideCategorySection && categoryOptions.length > 0 && (
        <FilterSection title="İş kategorisi">
          <div className="flex flex-wrap gap-2">
            <Chip active={!filters.category} onClick={() => set({ category: null })}>
              Tümü
            </Chip>
            {categoryOptions.map((opt) => (
              <Chip
                key={opt.id}
                active={filters.category === opt.id}
                onClick={() =>
                  set({ category: filters.category === opt.id ? null : opt.id })
                }
              >
                {opt.label}
                <span className="ml-1 opacity-70">{opt.count}</span>
              </Chip>
            ))}
          </div>
        </FilterSection>
      )}

      {districtOptions.length > 0 && (
        <FilterSection title="Konum">
          <div className="flex flex-wrap gap-2">
            <Chip
              active={!filters.districtSlug}
              onClick={() => set({ districtSlug: null })}
            >
              Tümü
            </Chip>
            {merkez && (
              <Chip
                active={filters.districtSlug === 'merkez'}
                muted={merkez.count === 0}
                onClick={() =>
                  set({
                    districtSlug:
                      filters.districtSlug === 'merkez' ? null : 'merkez',
                  })
                }
              >
                İl Merkezi
                {merkez.count > 0 && (
                  <span className="ml-1 opacity-70">{merkez.count}</span>
                )}
              </Chip>
            )}
            {otherDistricts.map((d) => (
              <Chip
                key={d.slug}
                active={filters.districtSlug === d.slug}
                muted={d.count === 0}
                onClick={() =>
                  set({
                    districtSlug: filters.districtSlug === d.slug ? null : d.slug,
                  })
                }
              >
                {d.name}
                {d.count > 0 && <span className="ml-1 opacity-70">{d.count}</span>}
              </Chip>
            ))}
            {citywide && (
              <Chip
                active={filters.districtSlug === CITYWIDE_DISTRICT_SLUG}
                onClick={() =>
                  set({
                    districtSlug:
                      filters.districtSlug === CITYWIDE_DISTRICT_SLUG
                        ? null
                        : CITYWIDE_DISTRICT_SLUG,
                  })
                }
              >
                İl geneli
                <span className="ml-1 opacity-70">{citywide.count}</span>
              </Chip>
            )}
          </div>
        </FilterSection>
      )}

      {sourceOptions.length > 1 && (
        <FilterSection title="Kaynak">
          <div className="flex flex-wrap gap-2">
            <Chip active={!filters.source} onClick={() => set({ source: null })}>
              Tümü
            </Chip>
            {sourceOptions.map((opt) => (
              <Chip
                key={opt.id}
                active={filters.source === opt.id}
                onClick={() =>
                  set({ source: filters.source === opt.id ? null : opt.id })
                }
              >
                {opt.label}
                <span className="ml-1 opacity-70">{opt.count}</span>
              </Chip>
            ))}
          </div>
        </FilterSection>
      )}

      {workTypeOptions.length > 0 && (
        <FilterSection title="Çalışma şekli">
          <div className="flex flex-wrap gap-2">
            <Chip active={!filters.workType} onClick={() => set({ workType: null })}>
              Tümü
            </Chip>
            {workTypeOptions.map((wt) => (
              <Chip
                key={wt}
                active={filters.workType === wt}
                onClick={() => set({ workType: filters.workType === wt ? null : wt })}
              >
                {wt}
              </Chip>
            ))}
          </div>
        </FilterSection>
      )}

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-3 w-full rounded-lg py-2 text-sm font-semibold text-[rgb(var(--color-brand))] hover:bg-[rgb(var(--color-brand))]/5"
        >
          Filtreleri temizle
        </button>
      )}
    </div>
  )
}

interface CityJobQuickFiltersProps {
  filters: CityJobFilterState
  onChange: (next: CityJobFilterState) => void
  categoryOptions: Array<{ id: JobCategoryId; label: string; count: number }>
  districtOptions: Array<{ slug: string; name: string; count: number }>
  className?: string
}

/** Horizontal chips for sticky mobile / tablet bars. */
export function CityJobQuickFilters({
  filters,
  onChange,
  categoryOptions,
  districtOptions,
  className,
}: CityJobQuickFiltersProps) {
  const set = (patch: Partial<CityJobFilterState>) => onChange({ ...filters, ...patch })

  const locationChips = districtOptions.filter(
    (d) => d.slug === 'merkez' || d.count > 0
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {categoryOptions.length > 0 && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-hide"
          role="group"
          aria-label="İş kategorisi"
        >
          <Chip
            active={!filters.category}
            onClick={() => set({ category: null })}
            size="compact"
          >
            Tümü
          </Chip>
          {categoryOptions.map((opt) => (
            <Chip
              key={opt.id}
              active={filters.category === opt.id}
              onClick={() =>
                set({ category: filters.category === opt.id ? null : opt.id })
              }
              size="compact"
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      )}
      {locationChips.length > 0 && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-hide"
          role="group"
          aria-label="Konum"
        >
          <Chip
            active={!filters.districtSlug}
            onClick={() => set({ districtSlug: null })}
            size="compact"
          >
            Tüm konumlar
          </Chip>
          {locationChips.map((d) => (
            <Chip
              key={d.slug}
              active={filters.districtSlug === d.slug}
              muted={d.count === 0}
              onClick={() =>
                set({
                  districtSlug: filters.districtSlug === d.slug ? null : d.slug,
                })
              }
              size="compact"
            >
              {d.slug === 'merkez' ? 'İl Merkezi' : d.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )
}
