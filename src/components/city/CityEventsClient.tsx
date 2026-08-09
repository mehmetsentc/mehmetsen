'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  Filter,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from 'lucide-react'
import { getDistrictsForProvince } from '@/constants/cities'
import { useEvents } from '@/hooks/useEvents'
import { BottomSheet } from '@/components/ui/BottomSheet'
import {
  countActiveFilters,
  DEFAULT_CITY_EVENT_FILTERS,
  extractDistrictOptions,
  extractVenueOptions,
  filterCityEvents,
  pickFeaturedEvents,
  sortCityEvents,
  type CityEventFilterState,
  type CityEventSort,
  type CityEventViewMode,
} from '@/lib/cityEventFilters'
import { cn } from '@/lib/utils'
import type { EventTimeRange } from '@/services/eventService'
import { CityEventFiltersPanel } from './CityEventFiltersPanel'
import { CityEventGridCard, CityEventGridCardSkeleton } from './CityEventGridCard'
import { CityEventListCard, CityEventListCardSkeleton } from './CityEventListCard'
import { CityEventTopSellers } from './CityEventTopSellers'

interface CityEventsClientProps {
  citySlug: string
  cityName: string
}

const SORT_OPTIONS: Array<{ id: CityEventSort; label: string }> = [
  { id: 'date', label: 'Tarihe göre' },
  { id: 'title', label: 'İsme göre' },
  { id: 'rating', label: 'Popülerlik' },
]

const TIME_RANGE_OPTIONS: Array<{ id: EventTimeRange; label: string }> = [
  { id: 'upcoming', label: 'Yaklaşan' },
  { id: 'past', label: 'Geçmiş' },
]

export function CityEventsClient({ citySlug, cityName }: CityEventsClientProps) {
  const [timeRange, setTimeRange] = useState<EventTimeRange>('upcoming')
  const { events, loading, error, retry } = useEvents({
    citySlug,
    timeRange,
  })

  const [filters, setFilters] = useState<CityEventFilterState>(DEFAULT_CITY_EVENT_FILTERS)
  const [sort, setSort] = useState<CityEventSort>('date')
  const [viewMode, setViewMode] = useState<CityEventViewMode>('grid')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  const allDistricts = useMemo(() => getDistrictsForProvince(citySlug), [citySlug])
  const venueOptions = useMemo(() => extractVenueOptions(events), [events])
  const districtOptions = useMemo(
    () => extractDistrictOptions(events, allDistricts),
    [events, allDistricts]
  )

  const filteredEvents = useMemo(() => {
    const filtered = filterCityEvents(events, filters)
    return sortCityEvents(filtered, sort)
  }, [events, filters, sort])

  const featuredEvents = useMemo(() => pickFeaturedEvents(events), [events])
  const activeFilterCount = countActiveFilters(filters)

  const handleResetFilters = () => setFilters(DEFAULT_CITY_EVENT_FILTERS)

  const showEmpty = !loading && !error && filteredEvents.length === 0

  return (
    <div className="w-full pb-8 pt-3 max-md:pt-2">
      {/* Page header */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))]/10">
              <CalendarDays className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            </span>
            <div>
              <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))] lg:text-xl">
                {cityName} Etkinlikleri
              </h1>
              <p className="text-xs text-[rgb(var(--color-text-secondary))] lg:text-sm">
                Konser, tiyatro, festival ve daha fazlası
              </p>
            </div>
          </div>
        </div>

        {/* Mobile filter trigger */}
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold lg:hidden',
            'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
            'text-[rgb(var(--color-text))] shadow-sm'
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtrele
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] px-1.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </header>

      <div className="flex gap-6 lg:gap-8">
        {/* Desktop sidebar */}
        <aside
          className="hidden w-56 shrink-0 lg:block xl:w-64"
          aria-label="Etkinlik filtreleri"
        >
          <div className="sticky top-4 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Filter className="h-4 w-4 text-[rgb(var(--color-brand))]" />
              <span className="text-sm font-bold text-[rgb(var(--color-text))]">Filtreler</span>
            </div>
            <CityEventFiltersPanel
              filters={filters}
              onChange={setFilters}
              venueOptions={venueOptions}
              districtOptions={districtOptions}
              onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
            />
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <CityEventTopSellers events={featuredEvents} loading={loading} />

          {/* Toolbar: time range + sort + view toggle + count */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-0.5"
                role="group"
                aria-label="Zaman aralığı"
              >
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTimeRange(opt.id)}
                    aria-pressed={timeRange === opt.id}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
                      timeRange === opt.id
                        ? 'bg-[rgb(var(--color-brand))] text-white'
                        : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                {loading ? (
                  'Yükleniyor…'
                ) : (
                  <>
                    <span className="font-semibold text-[rgb(var(--color-text))]">
                      {filteredEvents.length}
                    </span>{' '}
                    etkinlik
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="city-event-sort">
                Sıralama
              </label>
              <select
                id="city-event-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as CityEventSort)}
                className={cn(
                  'rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
                  'px-3 py-1.5 text-sm font-medium text-[rgb(var(--color-text))]',
                  'focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20'
                )}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div
                className="hidden items-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-0.5 lg:flex"
                role="group"
                aria-label="Görünüm"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-pressed={viewMode === 'grid'}
                  className={cn(
                    'rounded-md p-1.5 transition-colors',
                    viewMode === 'grid'
                      ? 'bg-[rgb(var(--color-brand))] text-white'
                      : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]'
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  className={cn(
                    'rounded-md p-1.5 transition-colors',
                    viewMode === 'list'
                      ? 'bg-[rgb(var(--color-brand))] text-white'
                      : 'text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text))]'
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <CityEventGridCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <CityEventListCardSkeleton key={i} />
                ))}
              </div>
            )
          ) : error ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">{error}</p>
              <button
                type="button"
                onClick={() => void retry()}
                className="mt-3 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-xs font-bold text-white"
              >
                Tekrar dene
              </button>
            </div>
          ) : showEmpty ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
              <CalendarDays className="mx-auto h-12 w-12 text-[rgb(var(--color-text-secondary))]/40" />
              <p className="mt-3 text-sm font-medium text-[rgb(var(--color-text))]">
                {activeFilterCount > 0
                  ? 'Seçili filtrelere uygun etkinlik bulunamadı.'
                  : timeRange === 'past'
                    ? 'Geçmiş etkinlik bulunamadı.'
                    : 'Yaklaşan etkinlik bulunamadı.'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-3 text-sm font-semibold text-[rgb(var(--color-brand))] hover:underline"
                >
                  Filtreleri temizle
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <>
              {/* Mobile: always compact list */}
              <div className="space-y-3 lg:hidden">
                {filteredEvents.map((event) => (
                  <CityEventListCard key={event.id} event={event} />
                ))}
              </div>
              {/* Desktop: grid */}
              <div className="hidden grid-cols-2 gap-4 lg:grid xl:grid-cols-3">
                {filteredEvents.map((event) => (
                  <CityEventGridCard key={event.id} event={event} />
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3 max-sm:space-y-2.5">
              {filteredEvents.map((event) => (
                <CityEventListCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filtrele"
        size="lg"
      >
        <CityEventFiltersPanel
          filters={filters}
          onChange={setFilters}
          venueOptions={venueOptions}
          districtOptions={districtOptions}
          onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
          className="px-2"
        />
        <div className="sticky bottom-0 mt-4 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-2 py-3">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(false)}
            className="w-full rounded-xl bg-[rgb(var(--color-brand))] py-3 text-sm font-bold text-white"
          >
            {filteredEvents.length} etkinlik göster
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
