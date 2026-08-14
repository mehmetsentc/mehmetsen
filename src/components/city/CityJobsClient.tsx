'use client'

import { useMemo, useState } from 'react'
import {
  Briefcase,
  Building2,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  Filter,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { getDistrictsForProvince } from '@/constants/cities'
import { BottomSheet } from '@/components/ui/BottomSheet'
import {
  CityJobFiltersPanel,
  CityJobQuickFilters,
} from '@/components/city/CityJobFiltersPanel'
import {
  countActiveJobFilters,
  DEFAULT_CITY_JOB_FILTERS,
  extractJobCategoryOptions,
  extractJobDistrictOptions,
  extractJobSourceOptions,
  extractJobWorkTypeOptions,
  filterCityJobs,
  jobCategoryLabel,
  resolveJobCategory,
  resolveJobDistrictSlug,
  sortCityJobs,
  type CityJobFilterState,
  type CityJobSort,
} from '@/lib/cityJobFilters'
import { cn } from '@/lib/utils'
import type { JobListing } from '@/types/jobListing'

interface CityJobsClientProps {
  citySlug: string
  cityName: string
  initialJobs: JobListing[]
  syncConfigured: boolean
  missingEnv: string[]
}

const SORT_OPTIONS: Array<{ id: CityJobSort; label: string }> = [
  { id: 'deadline', label: 'Son başvuruya göre' },
  { id: 'newest', label: 'En yeni' },
  { id: 'title', label: 'İsme göre' },
]

function formatDeadline(iso: string | null): string {
  if (!iso) return 'Son başvuru tarihi belirtilmedi'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function kindLabel(kind: JobListing['listingKind']): string | null {
  if (kind === 'iup') return 'IUP'
  if (kind === 'typ') return 'TYP'
  return null
}

function sourceLabel(source: JobListing['source']): string {
  if (source === 'kariyer') return 'Kariyer.net'
  if (source === 'iskur') return 'İŞKUR'
  return 'NaHaber'
}

function districtDisplayName(
  job: JobListing,
  provinceDistricts: Array<{ slug: string; name: string }>
): string | null {
  const slug = resolveJobDistrictSlug(job, provinceDistricts)
  if (slug === 'merkez') return 'İl Merkezi'
  if (slug) {
    return provinceDistricts.find((d) => d.slug === slug)?.name ?? slug
  }
  return job.locationLabel || job.district || null
}

export function CityJobsClient({
  citySlug,
  cityName,
  initialJobs,
  syncConfigured,
  missingEnv,
}: CityJobsClientProps) {
  const [filters, setFilters] = useState<CityJobFilterState>(DEFAULT_CITY_JOB_FILTERS)
  const [sort, setSort] = useState<CityJobSort>('deadline')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [tabletFiltersExpanded, setTabletFiltersExpanded] = useState(false)

  const provinceDistricts = useMemo(() => getDistrictsForProvince(citySlug), [citySlug])

  const categoryOptions = useMemo(
    () => extractJobCategoryOptions(initialJobs),
    [initialJobs]
  )
  const districtOptions = useMemo(
    () => extractJobDistrictOptions(initialJobs, provinceDistricts),
    [initialJobs, provinceDistricts]
  )
  const sourceOptions = useMemo(() => extractJobSourceOptions(initialJobs), [initialJobs])
  const workTypeOptions = useMemo(() => extractJobWorkTypeOptions(initialJobs), [initialJobs])

  const filtered = useMemo(() => {
    const list = filterCityJobs(initialJobs, filters, provinceDistricts)
    return sortCityJobs(list, sort)
  }, [initialJobs, filters, provinceDistricts, sort])

  const activeFilterCount = countActiveJobFilters(filters)
  const handleResetFilters = () => setFilters(DEFAULT_CITY_JOB_FILTERS)

  const setQuery = (query: string) => setFilters((prev) => ({ ...prev, query }))

  return (
    <div className="w-full pb-8 pt-3 max-md:pt-2">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3 md:mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))]/10">
              <Briefcase className="h-5 w-5 text-[rgb(var(--color-brand))]" />
            </span>
            <div>
              <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))] md:text-xl xl:text-2xl">
                {cityName} İş İlanları
              </h1>
              <p className="mt-0.5 text-xs text-[rgb(var(--color-text-secondary))] md:text-sm">
                Kariyer.net ve İŞKUR — başvuru kaynak sitede yapılır
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="hidden text-xs text-[rgb(var(--color-muted))] sm:block">
            Kaynak:{' '}
            <a
              href="https://www.kariyer.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[rgb(var(--color-brand))] underline-offset-2 hover:underline"
            >
              Kariyer.net
            </a>
            {' · '}
            <a
              href="https://www.iskur.gov.tr/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[rgb(var(--color-brand))] underline-offset-2 hover:underline"
            >
              İŞKUR
            </a>
          </p>
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
        </div>
      </header>

      {/* Mobile sticky category + location chips */}
      <div
        className={cn(
          'sticky top-0 z-20 -mx-1 mb-3 border-b border-[rgb(var(--color-border))]/80',
          'bg-[rgb(var(--color-bg))]/95 px-1 py-2 backdrop-blur-md md:hidden'
        )}
      >
        <CityJobQuickFilters
          filters={filters}
          onChange={setFilters}
          categoryOptions={categoryOptions}
          districtOptions={districtOptions}
        />
      </div>

      <div className="flex gap-6 xl:gap-8">
        {/* Desktop sidebar */}
        <aside
          className="hidden w-56 shrink-0 xl:block xl:w-72"
          aria-label="İş ilanı filtreleri"
        >
          <div className="sticky top-4 space-y-4">
            <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Filter className="h-4 w-4 text-[rgb(var(--color-brand))]" />
                <span className="text-sm font-bold text-[rgb(var(--color-text))]">
                  Filtreler
                </span>
              </div>
              <label className="relative mt-3 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
                <input
                  type="search"
                  value={filters.query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pozisyon veya işveren…"
                  className={cn(
                    'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]',
                    'py-2 pl-9 pr-3 text-sm text-[rgb(var(--color-text))]',
                    'placeholder:text-[rgb(var(--color-muted))]',
                    'focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20'
                  )}
                />
              </label>
              <CityJobFiltersPanel
                filters={filters}
                onChange={setFilters}
                categoryOptions={categoryOptions}
                districtOptions={districtOptions}
                sourceOptions={sourceOptions}
                workTypeOptions={workTypeOptions}
                onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
              />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Tablet filter bar */}
          <div className="mb-4 hidden md:block xl:hidden">
            <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 shadow-sm">
              <label className="relative mb-3 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
                <input
                  type="search"
                  value={filters.query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pozisyon, işveren veya ilçe ara…"
                  className={cn(
                    'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))]',
                    'py-2.5 pl-10 pr-3 text-sm text-[rgb(var(--color-text))]',
                    'placeholder:text-[rgb(var(--color-muted))]',
                    'focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20'
                  )}
                />
              </label>
              <CityJobQuickFilters
                filters={filters}
                onChange={setFilters}
                categoryOptions={categoryOptions}
                districtOptions={districtOptions}
              />
              <button
                type="button"
                onClick={() => setTabletFiltersExpanded((open) => !open)}
                className="mt-3 flex w-full items-center justify-between rounded-lg bg-[rgb(var(--color-surface-raised))] px-3 py-2 text-sm font-semibold text-[rgb(var(--color-text))]"
                aria-expanded={tabletFiltersExpanded}
              >
                <span className="inline-flex items-center gap-2">
                  <Filter className="h-4 w-4 text-[rgb(var(--color-brand))]" />
                  Kaynak & çalışma şekli
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
                  <CityJobFiltersPanel
                    filters={filters}
                    onChange={setFilters}
                    categoryOptions={categoryOptions}
                    districtOptions={districtOptions}
                    sourceOptions={sourceOptions}
                    workTypeOptions={workTypeOptions}
                    onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
                    hideCategorySection
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mobile search (desktop has it in sidebar) */}
          <label className="relative mb-4 block md:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input
              type="search"
              value={filters.query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pozisyon, işveren veya ilçe ara…"
              className={cn(
                'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
                'py-2.5 pl-10 pr-3 text-sm text-[rgb(var(--color-text))]',
                'placeholder:text-[rgb(var(--color-muted))]',
                'focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20'
              )}
            />
          </label>

          {!syncConfigured && initialJobs.length === 0 && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-[rgb(var(--color-text))]">
              <p className="font-semibold">İş ilanı senkronizasyonu henüz yapılandırılmadı</p>
              <p className="mt-1 text-[rgb(var(--color-text-secondary))]">
                Operatör: Vercel / .env.local içinde <code className="text-xs">APIFY_TOKEN</code>{' '}
                tanımlayın. Kariyer.net şehir URL’sinden çekilir.
              </p>
              <ul className="mt-2 list-inside list-disc font-mono text-xs text-[rgb(var(--color-muted))]">
                {missingEnv.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[rgb(var(--color-text-secondary))]">
              <span className="font-semibold text-[rgb(var(--color-text))]">
                {filtered.length}
              </span>{' '}
              ilan
              {activeFilterCount > 0 && (
                <span className="text-[rgb(var(--color-muted))]">
                  {' '}
                  · {initialJobs.length} toplam
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="city-job-sort">
                Sıralama
              </label>
              <select
                id="city-job-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as CityJobSort)}
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

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/60 px-6 py-14 text-center">
              <Briefcase className="mx-auto h-8 w-8 text-[rgb(var(--color-muted))]" />
              <h2 className="mt-3 text-base font-bold text-[rgb(var(--color-text))]">
                Şu an listelenecek ilan yok
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-[rgb(var(--color-text-secondary))]">
                {initialJobs.length === 0
                  ? `${cityName} için ilanlar günlük senkronize edilir. Kaynak hazır olduğunda burada görünür.`
                  : 'Arama veya filtrelere uyan ilan bulunamadı.'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 text-sm font-semibold text-[rgb(var(--color-brand))]"
                >
                  Filtreleri temizle
                </button>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {filtered.map((job) => {
                const kind = kindLabel(job.listingKind)
                const src = sourceLabel(job.source)
                const category = resolveJobCategory(job)
                const place = districtDisplayName(job, provinceDistricts)
                return (
                  <li key={job.id}>
                    <article
                      className={cn(
                        'group relative overflow-hidden rounded-xl border border-[rgb(var(--color-border))]',
                        'bg-[rgb(var(--color-card))] shadow-sm transition-colors',
                        'hover:border-[rgb(var(--color-brand))]/35'
                      )}
                    >
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:justify-between sm:p-5">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-[rgb(var(--color-brand))]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-brand))]">
                              {src}
                            </span>
                            <span className="rounded bg-[rgb(var(--color-surface-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-text-secondary))]">
                              {jobCategoryLabel(category)}
                            </span>
                            {kind && (
                              <span className="rounded bg-[rgb(var(--color-surface-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                                {kind}
                              </span>
                            )}
                            {job.employerType && (
                              <span className="rounded bg-[rgb(var(--color-surface-elevated))] px-2 py-0.5 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                                {job.employerType}
                              </span>
                            )}
                          </div>

                          <h2 className="text-base font-bold leading-snug text-[rgb(var(--color-text))] md:text-[17px]">
                            {job.title}
                          </h2>

                          {job.employer && (
                            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[rgb(var(--color-text-secondary))]">
                              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span className="truncate">{job.employer}</span>
                            </p>
                          )}

                          <div className="mt-3 grid gap-1.5 text-xs text-[rgb(var(--color-muted))] sm:grid-cols-2">
                            {place && (
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{place}</span>
                              </span>
                            )}
                            {job.deadlineAt && (
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                                {formatDeadline(job.deadlineAt)}
                              </span>
                            )}
                            {job.workType && (
                              <span className="inline-flex items-center gap-1.5">
                                <Briefcase className="h-3.5 w-3.5 shrink-0" />
                                {job.workType}
                              </span>
                            )}
                            {job.openPositions != null && job.openPositions > 0 && (
                              <span className="inline-flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 shrink-0" />
                                {job.openPositions} açık pozisyon
                              </span>
                            )}
                          </div>

                          {job.locationLabel && place !== job.locationLabel && (
                            <p className="mt-2 truncate text-[11px] text-[rgb(var(--color-muted))]">
                              {job.locationLabel}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col justify-center gap-2 sm:items-end">
                          {job.applyUrl ? (
                            <a
                              href={job.applyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                'inline-flex items-center justify-center gap-2 rounded-lg',
                                'bg-[rgb(var(--color-brand))] px-5 py-2.5 text-sm font-bold text-white',
                                'transition-opacity hover:opacity-90'
                              )}
                            >
                              İlana git
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            <span className="text-xs text-[rgb(var(--color-muted))]">
                              Başvuru linki yok
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="mt-6 text-center text-[11px] leading-relaxed text-[rgb(var(--color-muted))]">
            İlanlar Kariyer.net ve İŞKUR sistemlerinden derlenir; doğruluk için her zaman kaynak
            sayfayı kontrol edin. NaHaber başvuru almaz.
          </p>
        </div>
      </div>

      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="İş ilanı filtreleri"
        size="lg"
      >
        <div className="px-4 pb-6">
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
            <input
              type="search"
              value={filters.query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pozisyon veya işveren…"
              className={cn(
                'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
                'py-2.5 pl-10 pr-3 text-sm text-[rgb(var(--color-text))]',
                'placeholder:text-[rgb(var(--color-muted))]',
                'focus:border-[rgb(var(--color-brand))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-brand))]/20'
              )}
            />
          </label>
          <CityJobFiltersPanel
            filters={filters}
            onChange={setFilters}
            categoryOptions={categoryOptions}
            districtOptions={districtOptions}
            sourceOptions={sourceOptions}
            workTypeOptions={workTypeOptions}
            onReset={activeFilterCount > 0 ? handleResetFilters : undefined}
          />
          <button
            type="button"
            onClick={() => setFilterSheetOpen(false)}
            className={cn(
              'mt-4 w-full rounded-lg bg-[rgb(var(--color-brand))] py-3 text-sm font-bold text-white',
              'transition-opacity hover:opacity-90'
            )}
          >
            {filtered.length} ilanı göster
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
