'use client'

import { MapPin, AlertCircle } from 'lucide-react'
import { CategoryHeroStory } from '@/components/category/CategoryPostStories'
import { LocalNewsTopPanel } from '@/components/local/LocalNewsTopPanel'
import { LocalListStory } from '@/components/local/LocalListStory'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { cn } from '@/lib/utils'
import type { useLocalNewsPage } from '@/hooks/useLocalNewsPage'

type LocalNewsState = ReturnType<typeof useLocalNewsPage>

interface LocalNewsMobileProps {
  state: LocalNewsState
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
  const hero = posts[0]
  const rest = posts.slice(1)

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

      {showingGeneralFallback && city && !loading ? (
        <p className="mx-3 mb-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
          <span className="font-semibold text-[rgb(var(--color-text))]">{city.name}</span> için yerel haber
          bulunamadı — Türkiye geneli yerel haberler gösteriliyor.
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-4 px-3">
          <div className="aspect-[16/10] animate-pulse rounded-xl bg-[rgb(var(--color-border))]" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-[rgb(var(--color-border))]" />
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
        <div className="px-3">
          {hero ? (
            <div className="mb-5">
              <CategoryHeroStory post={hero} priority />
            </div>
          ) : null}

          {rest.length > 0 ? (
            <section aria-label="Haber listesi">
              <h2 className="local-section-title">Son haberler</h2>
              <div className={cn('local-list')}>
                {rest.map((post) => (
                  <LocalListStory key={post.id} post={post} />
                ))}
              </div>
            </section>
          ) : null}

          {loadingMore ? (
            <div className="mt-2 space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-[rgb(var(--color-border))]" />
              ))}
            </div>
          ) : null}
        </div>
      )}

      {hasMore ? (
        <LoadMoreDayButton onClick={() => void loadMore()} loading={loadingMore} />
      ) : null}
    </div>
  )
}
