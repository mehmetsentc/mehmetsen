'use client'

import { MapPin, AlertCircle } from 'lucide-react'
import { CategoryGridStory, CategoryHeroStory } from '@/components/category/CategoryPostStories'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { LocalNewsTopPanel } from '@/components/local/LocalNewsTopPanel'
import { PharmacyWidget } from '@/components/local/PharmacyWidget'
import { chunkPosts } from '@/components/local/localNewsLayout'
import { cn } from '@/lib/utils'
import type { useLocalNewsPage } from '@/hooks/useLocalNewsPage'

type LocalNewsState = ReturnType<typeof useLocalNewsPage>

interface LocalNewsMobileProps {
  state: LocalNewsState
}

export function LocalNewsMobile({ state }: LocalNewsMobileProps) {
  const {
    activeTab,
    city,
    posts,
    loading,
    loadingMore,
    error,
    showingGeneralFallback,
    sentinelRef,
    retryFetch,
  } = state

  const pageTitle = city ? `${city.name} Yerel Haber` : 'Yerel Haber'
  const hero = posts[0]
  const gridPosts = posts.slice(1)
  const gridChunks = chunkPosts(gridPosts, 4)

  return (
    <div className="w-full pb-8 lg:hidden">
      <LocalNewsTopPanel state={state} variant="mobile" />

      <div
        className="mb-3 flex items-center gap-3 rounded-2xl px-4 py-2.5"
        style={{ backgroundColor: '#05966918', borderLeft: '4px solid #059669' }}
      >
        <div>
          <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))]">{pageTitle}</h1>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">Şehrinizden son gelişmeler</p>
        </div>
      </div>

      {city && activeTab === 'eczaneler' ? (
        <PharmacyWidget citySlug={city.slug} cityName={city.name} />
      ) : null}

      <div className={cn('mt-1', city && activeTab !== 'haberler' && 'hidden')}>
        {showingGeneralFallback && city && !loading ? (
          <p className="mx-3 mb-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
            <span className="font-semibold text-[rgb(var(--color-text))]">{city.name}</span> için yerel haber
            bulunamadı — Türkiye geneli yerel haberler gösteriliyor.
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-4 px-3">
            <div className="aspect-[16/10] animate-pulse rounded-xl bg-[rgb(var(--color-border))]" />
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-lg bg-[rgb(var(--color-border))]" />
              ))}
            </div>
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
              <div className="mb-6">
                <CategoryHeroStory post={hero} priority />
              </div>
            ) : null}

            {gridChunks.map((chunk, index) => (
              <section key={`mobile-chunk-${index}`} className="mb-6">
                <div className="grid grid-cols-2 gap-3">
                  {chunk.map((post) => (
                    <CategoryGridStory key={post.id} post={post} />
                  ))}
                </div>
              </section>
            ))}

            {loadingMore ? (
              <div className="mb-4 grid grid-cols-2 gap-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="aspect-video animate-pulse rounded-lg bg-[rgb(var(--color-border))]" />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div ref={sentinelRef} className="h-4" aria-hidden />
    </div>
  )
}
