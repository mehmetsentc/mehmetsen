'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { MapPin, AlertCircle } from 'lucide-react'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopCategoryWatch } from '@/components/home/desktop/DesktopCategoryWatch'
import { GridStory, StackedStory } from '@/components/home/desktop/desktopGridStories'
import { LocalNewsTopPanel } from '@/components/local/LocalNewsTopPanel'
import { LocalNewsMagazineGrids } from '@/components/local/LocalNewsMagazineGrids'
import { buildLocalNewsMagazineLayout } from '@/components/local/localNewsLayout'
import { PharmacyWidget } from '@/components/local/PharmacyWidget'
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
    activeTab,
    posts,
    loading,
    loadingMore,
    error,
    showingGeneralFallback,
    sentinelRef,
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
  const sectionLead = city ? city.name.toLocaleUpperCase('tr-TR') : 'YEREL'

  const layout = useMemo(
    () => buildLocalNewsMagazineLayout(rankedPosts, sectionLead),
    [rankedPosts, sectionLead]
  )

  const { centerHero, leftHero, rightStack, namedSections, overflowChunks } = layout

  const showNews = activeTab === 'haberler'

  return (
    <div className="desktop-category-page pb-10">
      <LocalNewsTopPanel state={state} variant="desktop" />

      <h1 className="mb-6 text-center font-serif text-3xl font-bold text-[rgb(var(--color-text))] md:text-4xl">
        {pageTitle}
      </h1>

      {city && activeTab === 'eczaneler' ? (
        <PharmacyWidget citySlug={city.slug} cityName={city.name} />
      ) : null}

      {showNews ? (
        <>
          {showingGeneralFallback && city && !loading ? (
            <p className="mb-6 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3 text-sm leading-relaxed text-[rgb(var(--color-muted))]">
              <span className="font-semibold text-[rgb(var(--color-text))]">{city.name}</span> için yerel haber
              bulunamadı — Türkiye geneli yerel haberler gösteriliyor.
            </p>
          ) : null}

          <DesktopAdBanner slot="category-yerel-haber-top" size="large" className="mb-8" />

          {loading ? (
            <div className="mb-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded bg-[rgb(var(--color-border))]" />
              ))}
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
              {centerHero ? (
                <section
                  className="mb-10 grid grid-cols-12 items-start gap-4 border-b border-[rgb(var(--color-border))] pb-10"
                  aria-label="Öne çıkan haberler"
                >
                  {leftHero ? (
                    <div className="col-span-12 min-w-0 md:col-span-3 xl:col-span-3">
                      <GridStory post={leftHero} />
                    </div>
                  ) : null}
                  <div
                    className={
                      leftHero
                        ? 'col-span-12 min-w-0 md:col-span-6 xl:col-span-6'
                        : 'col-span-12 min-w-0 md:col-span-9 xl:col-span-9'
                    }
                  >
                    <GridStory post={centerHero} size="xl" />
                  </div>
                  {rightStack.length > 0 ? (
                    <aside
                      className="col-span-12 flex min-w-0 flex-col gap-1 md:col-span-3 xl:col-span-3"
                      aria-label="Son haberler"
                    >
                      {rightStack.map((post) => (
                        <StackedStory key={post.id} post={post} />
                      ))}
                    </aside>
                  ) : null}
                </section>
              ) : null}

              <LocalNewsMagazineGrids namedSections={namedSections} overflowChunks={[]} />

              <DesktopCategoryWatch posts={rankedPosts} categorySlug="yerel-haber" />

              <DesktopAdBanner slot="category-yerel-haber-mid" className="mb-10" />

              <LocalNewsMagazineGrids
                namedSections={[]}
                overflowChunks={overflowChunks}
                loadingMore={loadingMore}
                sentinelRef={sentinelRef}
              />

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
        </>
      ) : null}

    </div>
  )
}
