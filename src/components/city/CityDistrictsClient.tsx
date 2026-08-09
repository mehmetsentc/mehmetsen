'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CANAKKALE_REGION_TABS,
  districtMatchesCanakkaleRegion,
  getCanakkaleRegionForDistrict,
  type CanakkaleRegionId,
} from '@/constants/canakkaleDistricts'
import { CanakkaleDistrictMap } from './CanakkaleDistrictMap'

interface District {
  slug: string
  name: string
}

interface CityDistrictsClientProps {
  citySlug: string
  cityName: string
  districts: District[]
}

const REGION_LABELS: Record<CanakkaleRegionId, string> = {
  all: '',
  anadolu: 'Anadolu Yakası',
  gelibolu: 'Gelibolu Yarımadası',
  adalar: 'Ege Adaları',
}

export function CityDistrictsClient({
  citySlug,
  cityName,
  districts,
}: CityDistrictsClientProps) {
  const isCanakkale = citySlug === 'canakkale'
  const [activeRegion, setActiveRegion] = useState<CanakkaleRegionId>('all')
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)

  const filteredDistricts = useMemo(() => {
    if (!isCanakkale || activeRegion === 'all') return districts
    return districts.filter((d) => districtMatchesCanakkaleRegion(d.slug, activeRegion))
  }, [districts, activeRegion, isCanakkale])

  const regionCounts = useMemo(() => {
    if (!isCanakkale) return null
    const counts: Record<CanakkaleRegionId, number> = {
      all: districts.length,
      anadolu: 0,
      gelibolu: 0,
      adalar: 0,
    }
    for (const d of districts) {
      const region = getCanakkaleRegionForDistrict(d.slug)
      counts[region] += 1
    }
    return counts
  }, [districts, isCanakkale])

  return (
    <div className="home-feed mx-auto w-full max-w-4xl pb-8 max-md:pb-10 max-md:pt-4">
      {/* Page header */}
      <header className="mb-5 px-1">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))]/10">
            <MapPin className="h-5 w-5 text-[rgb(var(--color-brand))]" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))] lg:text-xl">
              {cityName} İlçeleri
            </h1>
            <p className="mt-0.5 text-sm text-[rgb(var(--color-text-secondary))]">
              Haritadan veya listeden ilçenizi seçerek yerel haber akışına geçin
            </p>
          </div>
        </div>
      </header>

      {districts.length > 0 ? (
        <>
          {/* Region tabs — Çanakkale only */}
          {isCanakkale && (
            <div
              className="mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide"
              role="tablist"
              aria-label="İlçe bölgeleri"
            >
              {CANAKKALE_REGION_TABS.map((tab) => {
                const active = activeRegion === tab.id
                const count = regionCounts?.[tab.id]
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveRegion(tab.id)}
                    className={cn(
                      'flex shrink-0 flex-col items-start rounded-full px-4 py-2 text-left transition-colors',
                      active
                        ? 'bg-[rgb(var(--color-brand))] text-white shadow-sm'
                        : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-raised-hover))] hover:text-[rgb(var(--color-text))]'
                    )}
                  >
                    <span className="text-sm font-semibold leading-tight">{tab.label}</span>
                    {count != null && (
                      <span
                        className={cn(
                          'text-[10px] font-medium leading-tight',
                          active ? 'text-white/80' : 'text-[rgb(var(--color-text-secondary))]/70'
                        )}
                      >
                        {count} ilçe
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Interactive map */}
          {isCanakkale && (
            <CanakkaleDistrictMap
              activeRegion={activeRegion}
              hoveredSlug={hoveredSlug}
              onHover={setHoveredSlug}
              className="mb-5"
            />
          )}

          {/* District list */}
          <section aria-label="İlçe listesi">
            {isCanakkale && activeRegion !== 'all' && (
              <h2 className="mb-3 px-1 text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-secondary))]">
                {REGION_LABELS[activeRegion]}
              </h2>
            )}

            {filteredDistricts.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDistricts.map((district) => {
                  const isHovered = hoveredSlug === district.slug
                  const region = isCanakkale
                    ? getCanakkaleRegionForDistrict(district.slug)
                    : null

                  return (
                    <Link
                      key={district.slug}
                      href={`/ilceler/${district.slug}`}
                      onMouseEnter={() => setHoveredSlug(district.slug)}
                      onMouseLeave={() => setHoveredSlug(null)}
                      onFocus={() => setHoveredSlug(district.slug)}
                      onBlur={() => setHoveredSlug(null)}
                      className={cn(
                        'group flex items-center justify-between rounded-xl',
                        'border bg-[rgb(var(--color-surface-raised))] px-4 py-3.5',
                        'transition-all duration-200',
                        isHovered
                          ? 'border-[rgb(var(--color-brand))]/50 bg-[rgb(var(--color-brand))]/5 shadow-sm'
                          : 'border-[rgb(var(--color-border))] hover:bg-[rgb(var(--color-surface-raised-hover))]'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                            isHovered
                              ? 'bg-[rgb(var(--color-brand))] text-white'
                              : 'bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
                          )}
                        >
                          <MapPin className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))]">
                            {district.name}
                          </span>
                          {region && region !== 'all' && activeRegion === 'all' && (
                            <span className="block truncate text-[11px] text-[rgb(var(--color-text-secondary))]">
                              {REGION_LABELS[region]}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className={cn(
                          'h-4 w-4 shrink-0 transition-colors',
                          isHovered
                            ? 'text-[rgb(var(--color-brand))]'
                            : 'text-[rgb(var(--color-text-secondary))]'
                        )}
                      />
                    </Link>
                  )
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-[rgb(var(--color-text-secondary))]">
                Bu bölgede ilçe bulunamadı.
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="py-16 text-center">
          <MapPin className="mx-auto h-12 w-12 text-[rgb(var(--color-text-secondary))]/40" />
          <p className="mt-3 text-sm text-[rgb(var(--color-text-secondary))]">
            İlçe verisi bulunamadı.
          </p>
        </div>
      )}
    </div>
  )
}
