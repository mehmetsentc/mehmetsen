'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  Filter,
  SlidersHorizontal,
} from 'lucide-react'
import { getDistrictsForProvince } from '@/constants/cities'
import { useEvents } from '@/hooks/useEvents'
import { filterEventsForQuery } from '@/services/eventService'
import { BottomSheet } from '@/components/ui/BottomSheet'
import {
  cinemaStripDayIso,
  countActiveFilters,
  DEFAULT_CITY_EVENT_FILTERS,
  extractCategoryOptions,
  extractDistrictOptions,
  extractVenueOptions,
  filterCityEvents,
  pickCinemaEventsForDay,
  resolveEventFilterCategory,
  sortCityEvents,
  type CityEventFilterState,
  type CityEventSort,
} from '@/lib/cityEventFilters'
import { cn } from '@/lib/utils'
import type { EventTimeRange } from '@/services/eventService'
import type { NaEvent } from '@/types/event'
import {
  CityEventFiltersPanel,
  CityEventQuickFilters,
} from './CityEventFiltersPanel'
import { CityCinemaEventsStrip } from './CityCinemaEventsStrip'
import { CityEventListCard, CityEventListCardSkeleton } from './CityEventListCard'

interface CityEventsClientProps {
  citySlug: string
  cityName: string
  /** SSR-prefetched upcoming events — shown immediately while client revalidates. */
  initialEvents?: NaEvent[]
}

const SORT_OPTIONS: Array<{ id: CityEventSort; label: string }> = [
  { id: 'date', label: 'Tarihe göre' },
  { id: 'title', label: 'İsme göre' },
  { id: 'rating', label: 'Popülerlik' },
]

const TIME_RANGE: EventTimeRange = 'upcoming'

const BACK_VOWELS = new Set(['a', 'ı', 'o', 'u'])

function cityLocative(cityName: string): string {
  const chars = [...cityName.toLocaleLowerCase('tr-TR')]
  let vowel: string | null = null
  for (let i = chars.length - 1; i >= 0; i--) {
    if ('aeıioöuü'.includes(chars[i])) {
      vowel = chars[i]
      break
    }
  }
  const suffix = vowel && BACK_VOWELS.has(vowel) ? "'da" : "'de"
  return `${cityName}${suffix}`
}

export function CityEventsClient({
  citySlug,
  cityName,
  initialEvents = [],
}: CityEventsClientProps) {
  const timeRange = TIME_RANGE
  const { events, loading, error, retry } = useEvents({
    citySlug,
    timeRange,
  })

  // SSR ile gelen initialEvents'i; client yüklenirken VE timeout/hata durumunda da göster
  const rawDisplayEvents = (() => {
    const hasSSR = initialEvents.length > 0
    if (hasSSR && (loading || error) && events.length === 0) return initialEvents
    return events
  })()

  const displayEvents = useMemo(
    () => filterEventsForQuery(rawDisplayEvents, { timeRange }),
    [rawDisplayEvents, timeRange]
  )

  const [filters, setFilters] = useState<CityEventFilterState>(DEFAULT_CITY_EVENT_FILTERS)
  const [sort, setSort] = useState<CityEventSort>('date')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [tabletFiltersExpanded, setTabletFiltersExpanded] = useState(false)

  const allDistricts = useMemo(() => getDistrictsForProvince(citySlug), [citySlug])
  const categoryOptions = useMemo(() => extractCategoryOptions(displayEvents), [displayEvents])
  const venueOptions = useMemo(() => extractVenueOptions(displayEvents), [displayEvents])
  const districtOptions = useMemo(
    () => extractDistrictOptions(displayEvents, allDistricts),
    [displayEvents, allDistricts]
  )

  // Drop stale category when the loaded event set no longer includes it.
  useEffect(() => {
    if (
      filters.category &&
      !categoryOptions.some((cat) => cat.id === filters.category)
    ) {
      setFilters((prev) => ({ ...prev, category: null }))
    }
  }, [categoryOptions, filters.category])

  const filteredEvents = useMemo(() => {
    const filtered = filterCityEvents(displayEvents, filters, undefined, { timeRange })
    return sortCityEvents(filtered, sort)
  }, [displayEvents, filters, sort, timeRange])

  const cinemaEvents = useMemo(() => {
    if (filters.category && filters.category !== 'cinema') return []
    return pickCinemaEventsForDay(
      filterCityEvents(
        displayEvents,
        { ...filters, category: 'cinema' },
        undefined,
        { timeRange }
      ),
      cinemaStripDayIso(filters.dateFilter)
    )
  }, [displayEvents, filters, timeRange])

  const listedEvents = useMemo(() => {
    if (filters.category === 'cinema') return []
    return filteredEvents.filter((event) => resolveEventFilterCategory(event) !== 'cinema')
  }, [filteredEvents, filters.category])

  const cinemaTitle = useMemo(() => {
    const locative = cityLocative(cityName)
    if (filters.dateFilter === 'tomorrow') return `Yarın ${locative} Sinemalar`
    return `Bugün ${locative} Sinemalar`
  }, [cityName, filters.dateFilter])

  const activeFilterCount = countActiveFilters(filters)

  const handleResetFilters = () => setFilters(DEFAULT_CITY_EVENT_FILTERS)

  // SSR fallback aktifken error UI'ı gizle (soft retry yeterli)
  const clientErrorVisible = !!error && rawDisplayEvents.length === 0
  const showEmpty =
    !loading && !clientErrorVisible && listedEvents.length === 0 && cinemaEvents.length === 0
  const showSkeletons = loading && displayEvents.length === 0

  return (
    <div className="w-full pb-8 pt-3 max-md:pt-2">
      {/* Page header */}
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3 md:mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))]/10">
              <CalendarDays className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            </span>
            <div>
              <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))] xl:text-xl">
                {cityName} Etkinlikleri
              </h1>
              <p className="text-xs text-[rgb(var(--color-text-secondary))] md:text-sm">
                Bugünün ve yaklaşan tek günlük etkinlikleri
              </p>
            </div>
          </div>
        </div>

        {/* Mobile + tablet filter trigger */}
        <button
          type="button"
          onClick={() => setFilterSheetOpen(true)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold xl:hidden',
            'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
            'text-[rgb(var(--color-text))] shadow-sm'
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtreler
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] px-1.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </header>

      {/* Mobile: sticky quick category + date chips */}
      <div
        className={cn(
          'sticky top-0 z-20 -mx-1 mb-3 border-b border-[rgb(var(--color-border))]/80',
          'bg-[rgb(var(--color-bg))]/95 px-1 py-2 backdrop-blur-md md:hidden'
        )}
      >
        <CityEventQuickFilters
          filters={filters}
          onChange={setFilters}
          categoryOptions={categoryOptions}
          showDateFilters
        />
      </div>

      <div className="flex gap-6 xl:gap-8">
        {/* Desktop xl+ sidebar rail */}
        <aside
          className="hidden w-56 shrink-0 xl:block xl:w-64"
          aria-label="Etkinlik filtreleri"
        >
          <div className="sticky top-4 space-y-4">
            <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Filter className="h-4 w-4 text-[rgb(var(--color-brand))]" />
                <span className="text-sm font-bold text-[rgb(var(--color-text))]">Filtreler</span>
              </div>
              <CityEventFiltersPanel
                filters={filters}
                onChange={setFilters}
                categoryOptions={categoryOptions}
                venueOptions={venueOptions}
                districtOptions={districtOptions}
                onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
              />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Tablet md–xl: collapsible filter bar */}
          <div className="mb-4 hidden md:block xl:hidden">
            <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 shadow-sm">
              <CityEventQuickFilters
                filters={filters}
                onChange={setFilters}
                categoryOptions={categoryOptions}
                showDateFilters
              />
              <button
                type="button"
                onClick={() => setTabletFiltersExpanded((open) => !open)}
                className="mt-3 flex w-full items-center justify-between rounded-lg bg-[rgb(var(--color-surface-raised))] px-3 py-2 text-sm font-semibold text-[rgb(var(--color-text))]"
                aria-expanded={tabletFiltersExpanded}
              >
                <span className="inline-flex items-center gap-2">
                  <Filter className="h-4 w-4 text-[rgb(var(--color-brand))]" />
                  Mekan & ilçe
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-[rgb(var(--color-brand))] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    tabletFiltersExpanded && 'rotate-180'
                  )}
                />
              </button>
              {tabletFiltersExpanded && (
                <div className="mt-3 border-t border-[rgb(var(--color-border))] pt-3">
                  <CityEventFiltersPanel
                    filters={filters}
                    onChange={setFilters}
                    categoryOptions={categoryOptions}
                    venueOptions={venueOptions}
                    districtOptions={districtOptions}
                    onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
                    hideCategorySection
                  />
                </div>
              )}
            </div>
          </div>

          {showSkeletons ? (
            <div className="mb-5 flex gap-3 overflow-hidden">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="h-40 w-[240px] shrink-0 animate-pulse rounded-xl bg-[rgb(var(--color-surface-raised))]"
                />
              ))}
            </div>
          ) : (
            <CityCinemaEventsStrip
              events={cinemaEvents}
              cityName={cityName}
              title={cinemaTitle}
              variant="page"
            />
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">
              {showSkeletons ? (
                'Yükleniyor…'
              ) : (
                <>
                  <span className="font-semibold text-[rgb(var(--color-text))]">
                    {listedEvents.length + cinemaEvents.length}
                  </span>{' '}
                  etkinlik
                </>
              )}
            </p>

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
            </div>
          </div>

          {showSkeletons ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <CityEventListCardSkeleton key={i} />
              ))}
            </div>
          ) : clientErrorVisible ? (
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
                  : 'Bugün veya ilerisi için tek günlük etkinlik bulunamadı.'}
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
          ) : (
            <div className="space-y-3">
              {listedEvents.map((event) => (
                <CityEventListCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile/tablet filter sheet */}
      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filtreler"
        size="lg"
      >
        <CityEventFiltersPanel
          filters={filters}
          onChange={setFilters}
          categoryOptions={categoryOptions}
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
            {listedEvents.length + cinemaEvents.length} etkinlik göster
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
