'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { MapPin, AlertCircle } from 'lucide-react'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopCategoryWatch } from '@/components/home/desktop/DesktopCategoryWatch'
import { GridStory, StackedStory } from '@/components/home/desktop/desktopGridStories'
import { LocalNewsTopPanel } from '@/components/local/LocalNewsTopPanel'
import { LocalCityEventsStrip } from '@/components/local/LocalCityEventsStrip'
import { LocalGastronomyStrip } from '@/components/local/LocalGastronomyStrip'
import { LocalListStory } from '@/components/local/LocalListStory'
import { LoadMoreDayButton } from '@/components/feed/LoadMoreDayButton'
import { buildLocalNewsReadableLayout } from '@/components/local/localNewsLayout'
import { ROUTES } from '@/constants/routes'
import { rankFeedPosts } from '@/lib/feedRanking'
import { useAuth } from '@/hooks/useAuth'
import type { useLocalNewsPage } from '@/hooks/useLocalNewsPage'

type LocalNewsState = ReturnType<typeof useLocalNewsPage>

interface DesktopLocalNewsPageProps {
  state: LocalNewsState
}

export function DesktopLocalNewsPage({ state }: DesktopLocalNewsPageProps) {
  const { user } = useAuth()
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

  const rankedPosts = useMemo(
    () =>
      rankFeedPosts(posts, {
        citySlug: city?.slug ?? user?.citySlug ?? null,
        favoriteCategories: user?.favoriteCategories,
        interests: user?.interests,
        followingUsernames: new Set(),
      }),
    [posts, city?.slug, user]
  )

  const pageTitle = city ? `${city.name} Yerel Haber` : 'Yerel Haber'
  const layout = useMemo(() => buildLocalNewsReadableLayout(rankedPosts), [rankedPosts])
  const { lead, rail, list, gridChunks } = layout

  return (
    <div className="desktop-category-page local-page pb-10">
      <LocalNewsTopPanel state={state} variant="desktop" />

      <header className="mb-6">
        <p className="local-page__kicker">Yerel</p>
        <h1 className="local-page__title">{pageTitle}</h1>
      </header>

      {showingGeneralFallback && city && !loading ? (
        <p className="mb-6 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
          <span className="font-semibold text-[rgb(var(--color-text))]">{city.name}</span> için yerel haber
          bulunamadı — Türkiye geneli yerel haberler gösteriliyor.
        </p>
      ) : null}

      {/* Şehre özel etkinlik / sinema şeritleri — event yoksa strip null döner */}
      {city ? (
        <>
          <LocalCityEventsStrip citySlug={city.slug} cityName={city.name} />
          <LocalCityEventsStrip
            citySlug={city.slug}
            cityName={city.name}
            filter="cinema"
          />
          <LocalGastronomyStrip />
        </>
      ) : null}

      <DesktopAdBanner slot="category-yerel-haber-top" size="large" className="mb-8" />

      {loading ? (
        <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="aspect-[16/10] animate-pulse rounded bg-[rgb(var(--color-border))] md:col-span-2" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-[rgb(var(--color-border))]" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="mb-10 rounded-2xl border border-[rgb(var(--color-border))] p-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="font-semibold text-[rgb(var(--color-text))]">{error}</p>
          <button
            type="button"
            onClick={retryFetch}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--color-brand))] px-4 py-2 text-xs font-bold text-white"
          >
            Tekrar dene
          </button>
        </div>
      ) : (
        <>
          {lead ? (
            <section className="local-lead" aria-label="Öne çıkan haberler">
              <div className="min-w-0">
                <GridStory post={lead} size="xl" />
              </div>
              {rail.length > 0 ? (
                <aside className="local-rail" aria-label="Son haberler">
                  <p className="local-rail__heading">Son haberler</p>
                  {rail.map((post) => (
                    <StackedStory key={post.id} post={post} />
                  ))}
                </aside>
              ) : null}
            </section>
          ) : null}

          {list.length > 0 ? (
            <section className="mb-10" aria-label="Günün haberleri">
              <h2 className="local-section-title">Günün haberleri</h2>
              <div className="local-list">
                {list.map((post) => (
                  <LocalListStory key={post.id} post={post} />
                ))}
              </div>
            </section>
          ) : null}

          <DesktopCategoryWatch posts={rankedPosts} categorySlug="yerel-haber" />

          <DesktopAdBanner slot="category-yerel-haber-mid" className="mb-10" />

          {gridChunks.map((chunk, index) => (
            <section
              key={`grid-${index}`}
              className="mb-10"
              aria-label={index === 0 ? 'Daha fazla haber' : undefined}
            >
              {index === 0 ? <h2 className="local-section-title">Daha fazla</h2> : null}
              <div className="local-more-grid">
                {chunk.map((post) => (
                  <GridStory key={post.id} post={post} />
                ))}
              </div>
            </section>
          ))}

          {loadingMore ? (
            <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded bg-[rgb(var(--color-border))]" />
              ))}
            </div>
          ) : null}

          {hasMore ? (
            <LoadMoreDayButton onClick={() => void loadMore()} loading={loadingMore} />
          ) : null}

          {!loading && rankedPosts.length === 0 ? (
            <div className="mb-10 border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
              <MapPin className="mx-auto mb-3 h-10 w-10 text-[rgb(var(--color-muted))]" />
              <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
                {city ? `${city.name} haberleri henüz eklenmedi` : 'Haber bulunamadı'}
              </p>
              <Link
                href={ROUTES.FEED}
                className="mt-3 inline-block text-sm font-semibold text-[rgb(var(--color-brand))] hover:underline"
              >
                Ana sayfaya dön
              </Link>
            </div>
          ) : null}

          <DesktopAdBanner slot="category-yerel-haber-bottom" size="large" className="mb-10" />
        </>
      )}
    </div>
  )
}
