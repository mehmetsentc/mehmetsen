'use client'

import {
  MapPin, Search, X, Navigation, Loader2,
} from 'lucide-react'
import { WeatherAirQualityWidget } from '@/components/local/WeatherAirQualityWidget'
import { cn } from '@/lib/utils'
import type { useLocalNewsPage } from '@/hooks/useLocalNewsPage'

type LocalNewsState = ReturnType<typeof useLocalNewsPage>

interface LocalNewsTopPanelProps {
  state: LocalNewsState
  variant?: 'desktop' | 'mobile'
}

function LocalNewsTabs({
  state,
  compact,
}: {
  state: LocalNewsState
  compact?: boolean
}) {
  const { activeTab, setActiveTab, city } = state
  if (!city) return null

  return (
    <div className={cn('flex gap-2', compact ? 'px-3 pb-2 pt-1' : 'pt-3')}>
      {([
        ['haberler', MapPin, 'Haberler'],
        ['eczaneler', null, 'Nöbetçi Eczaneler'],
      ] as const).map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setActiveTab(key)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all',
            activeTab === key
              ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
              : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
          )}
        >
          {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="text-[11px]">💊</span>}
          {label}
        </button>
      ))}
    </div>
  )
}

export function LocalNewsTopPanel({ state, variant = 'desktop' }: LocalNewsTopPanelProps) {
  const {
    city,
    query,
    setQuery,
    filteredCities,
    locationState,
    handleSelectCity,
    startAutoLocation,
    chipsScrollRef,
    selectedChipRef,
  } = state

  const isMobile = variant === 'mobile'

  return (
    <section
      className={cn(
        'local-news-top-panel mb-8 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
        isMobile ? 'rounded-none' : 'rounded-xl border shadow-sm'
      )}
      aria-label="Yerel haber araçları"
    >
      <div className={cn(isMobile ? 'px-3 pt-3' : 'p-4')}>
        <div className={cn('flex flex-wrap items-center gap-3', isMobile && 'gap-2')}>
          <div
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2',
              isMobile ? 'min-w-[200px]' : 'min-w-[240px]'
            )}
          >
            <Search className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
            <input
              type="search"
              placeholder="Şehir ara… (İstanbul, Bursa…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="shrink-0" aria-label="Aramayı temizle">
                <X className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={startAutoLocation}
            title="GPS ile tespit et"
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-xs font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-brand))]',
              isMobile ? 'h-9 w-9 justify-center px-0' : 'px-3 py-2'
            )}
          >
            {locationState === 'requesting' ? (
              <Loader2 className="h-4 w-4 animate-spin text-[rgb(var(--color-brand))]" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            {!isMobile ? 'Konumumu kullan' : null}
          </button>

          {city ? (
            <div className="flex min-w-0 items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" />
              <span className="truncate font-semibold text-[rgb(var(--color-brand))]">{city.name}</span>
              <span className="shrink-0 text-xs text-[rgb(var(--color-muted))]">
                {locationState === 'granted' ? '· GPS' : locationState === 'stored' ? '· Kaydedilmiş' : ''}
              </span>
            </div>
          ) : null}
        </div>

        <div
          ref={chipsScrollRef}
          className={cn(
            'mt-3 flex gap-2 overflow-x-auto scroll-px-3 pb-1 scrollbar-hide',
            isMobile && 'snap-x'
          )}
        >
          {filteredCities.map((c) => {
            const isSelected = city?.slug === c.slug
            return (
              <button
                key={c.slug}
                ref={isSelected ? selectedChipRef : null}
                type="button"
                onClick={() => handleSelectCity(c)}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                  isMobile && 'snap-start',
                  isSelected
                    ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
                    : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] hover:border-[rgb(var(--color-primary))]/40 hover:text-[rgb(var(--color-text))]'
                )}
              >
                {c.name}
              </button>
            )
          })}
          {filteredCities.length === 0 ? (
            <p className="py-1.5 text-xs text-[rgb(var(--color-muted))]">Şehir bulunamadı</p>
          ) : null}
        </div>

        <LocalNewsTabs state={state} compact={isMobile} />
      </div>

      {city?.lat && city.lng ? (
        <div className={cn('border-t border-[rgb(var(--color-border))]', isMobile ? 'px-0' : 'px-4 pb-4')}>
          <WeatherAirQualityWidget lat={city.lat} lng={city.lng} cityName={city.name} />
        </div>
      ) : null}
    </section>
  )
}
