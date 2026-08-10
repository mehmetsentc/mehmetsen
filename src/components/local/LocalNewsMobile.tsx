'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPin, AlertCircle, ArrowUp } from 'lucide-react'
import { LocalCityEventsStrip } from '@/components/local/LocalCityEventsStrip'
import { LocalNewsTopPanel } from '@/components/local/LocalNewsTopPanel'
import { MobileFeedCard } from '@/components/feed/MobileFeedCard'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import type { useLocalNewsPage } from '@/hooks/useLocalNewsPage'

type LocalNewsState = ReturnType<typeof useLocalNewsPage>

interface LocalNewsMobileProps {
  state: LocalNewsState
}

function ScrollToTopFab() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 600)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollUp = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={scrollUp}
      aria-label="Yukarı dön"
      className="sd-fab"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  )
}

export function LocalNewsMobile({ state }: LocalNewsMobileProps) {
  const {
    city,
    posts,
    loading,
    loadingMore,
    error,
    showingGeneralFallback,
    hasMore,
    loadMore,
    retryFetch,
  } = state

  const pageTitle = city ? `${city.name} Yerel Haber` : 'Yerel Haber'

  return (
    <div className="local-page w-full pb-8 lg:hidden">
      <LocalNewsTopPanel state={state} variant="mobile" />

      <header className="px-3 mb-4">
        <p className="local-page__kicker">Yerel</p>
        <h1 className="local-page__title">{pageTitle}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[rgb(var(--color-muted))]">
          Şehrinizden son gelişmeler
        </p>
      </header>

      {/* Şehre özel etkinlik / sinema şeritleri — event yoksa strip null döner */}
      {city ? (
        <>
          <LocalCityEventsStrip citySlug={city.slug} cityName={city.name} />
          <LocalCityEventsStrip
            citySlug={city.slug}
            cityName={city.name}
            filter="cinema"
          />
        </>
      ) : null}

      {showingGeneralFallback && city && !loading ? (
        <p className="mx-3 mb-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
          <span className="font-semibold text-[rgb(var(--color-text))]">{city.name}</span> için yerel haber
          bulunamadı — Türkiye geneli yerel haberler gösteriliyor.
        </p>
      ) : null}

      {loading ? (
        <div className="sd-feed">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="sd-feed__skeleton">
              <div className="sd-feed__skeleton-time animate-pulse bg-[rgb(var(--color-border))]" />
              <div className="sd-feed__skeleton-title animate-pulse bg-[rgb(var(--color-border))]" />
              <div className="sd-feed__skeleton-media animate-pulse bg-[rgb(var(--color-border))]" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mx-3 mt-4 rounded-2xl border border-[rgb(var(--color-border))] p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{error}</p>
          <button
            type="button"
            onClick={retryFetch}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-xs font-bold text-white"
          >
            Tekrar dene
          </button>
        </div>
      ) : posts.length === 0 && !loading ? (
        <div className="mx-3 mt-4 rounded-2xl border border-dashed border-[rgb(var(--color-border))] px-6 py-12 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-[rgb(var(--color-muted))]" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
            {city ? `${city.name} haberleri henüz eklenmedi` : 'Haber bulunamadı'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
            Yakında tüm şehirler eklenecek. Başka bir şehir seçebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="sd-feed">
          {posts.map((post, i) => (
            <MobileFeedCard key={post.id} post={post} priority={i === 0} />
          ))}

          {loadingMore ? (
            <>
              {[...Array(2)].map((_, i) => (
                <div key={i} className="sd-feed__skeleton">
                  <div className="sd-feed__skeleton-time animate-pulse bg-[rgb(var(--color-border))]" />
                  <div className="sd-feed__skeleton-title animate-pulse bg-[rgb(var(--color-border))]" />
                  <div className="sd-feed__skeleton-media animate-pulse bg-[rgb(var(--color-border))]" />
                </div>
              ))}
            </>
          ) : null}
        </div>
      )}

      {hasMore ? (
        <LoadMoreDayButton onClick={() => void loadMore()} loading={loadingMore} />
      ) : null}

      <ScrollToTopFab />
    </div>
  )
}
