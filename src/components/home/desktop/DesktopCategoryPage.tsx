'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopCategoryWatch } from '@/components/home/desktop/DesktopCategoryWatch'
import { DesktopHomeFooter } from '@/components/home/desktop/DesktopHomeFooter'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { DesktopScrollHeader } from '@/components/home/desktop/DesktopScrollHeader'
import {
  categoryPostHref,
  categoryPostImage,
  categoryPostSummary,
} from '@/components/home/desktop/categoryPostUtils'
import { DesktopMoreList } from '@/components/home/desktop/DesktopMoreList'
import { ROUTES } from '@/constants/routes'
import { useTimelineFeed } from '@/hooks/useTimelineFeed'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { useAppState } from '@/store/appStateContext'
import { getCache } from '@/lib/clientCache'
import { PAGE_CACHE_KEYS, PAGE_CACHE_TTL } from '@/lib/pageCache'
import { rankFeedPosts } from '@/lib/feedRanking'
import { useAuth } from '@/hooks/useAuth'
import { FOUR_CARD_GRID } from '@/components/home/desktop/desktopLayout'
import { cn } from '@/lib/utils'
import type { CategoryDef } from '@/constants/config'
import type { TimelinePost } from '@/types/post'

interface SubTab {
  id: string
  slug: string
  name: string
  color: string
  href: string
  active: boolean
}

interface DesktopCategoryPageProps {
  cat: CategoryDef
  headerCat: CategoryDef
  isSubcategory: boolean
  parentCat: CategoryDef | null
  subTabs: SubTab[]
  tabParent: CategoryDef | null
  initialPosts: TimelinePost[]
  topSlot?: React.ReactNode
}

/** Ana sayfa ile aynı — satırda en fazla 4 kart. */

function GridStory({ post, size = 'md' }: { post: TimelinePost; size?: 'md' | 'lg' | 'xl' }) {
  const href = categoryPostHref(post)
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)

  const aspect =
    size === 'xl' ? 'aspect-[16/10]' : size === 'lg' ? 'aspect-[16/10]' : 'aspect-video'
  const titleSize =
    size === 'xl' ? 'text-2xl md:text-3xl' : size === 'lg' ? 'text-xl' : 'text-base'

  return (
    <article className="min-w-0">
      <Link href={href} className="group block min-w-0">
        <div className={cn('relative mb-3 w-full overflow-hidden bg-[rgb(var(--color-border))]', aspect)}>
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 1280px) 50vw, 300px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <h3 className={cn('break-words font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline', titleSize)}>
          {post.title}
        </h3>
        {summary ? (
          <p className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-[rgb(var(--color-muted))]">{summary}</p>
        ) : null}
      </Link>
    </article>
  )
}

function StackedStory({ post }: { post: TimelinePost }) {
  const href = categoryPostHref(post)
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)

  return (
    <article className="border-b border-[rgb(var(--color-border))] pb-4 last:border-b-0 last:pb-0">
      <Link href={href} className="group flex gap-3">
        <div className="relative h-[72px] w-[108px] shrink-0 overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage src={image} alt={post.title} fill sizes="108px" className="object-cover transition-transform group-hover:scale-[1.02]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-3 text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">{post.title}</h3>
          {summary ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">{summary}</p> : null}
        </div>
      </Link>
    </article>
  )
}

export function DesktopCategoryPage({
  cat,
  headerCat,
  isSubcategory,
  parentCat,
  subTabs,
  tabParent,
  initialPosts,
  topSlot,
}: DesktopCategoryPageProps) {
  const { user } = useAuth()
  const cacheKey = PAGE_CACHE_KEYS.category(cat.id)
  const cachedPosts = initialPosts.length ? initialPosts : (getCache<TimelinePost[]>(cacheKey) ?? [])

  const { posts, loading, loadingMore, hasMore, loadMore } = useTimelineFeed(
    cat.id,
    'nahaber',
    undefined,
    { initialPosts: cachedPosts, initialCategoryId: cat.id, initialFeedSource: 'nahaber' }
  )

  const { setCachedFeed } = useAppState()
  useEffect(() => {
    if (loading || posts.length === 0) return
    setCachedFeed(cacheKey, posts.slice(0, 30), PAGE_CACHE_TTL.category)
  }, [posts, loading, cacheKey, setCachedFeed])

  const rankedPosts = useMemo(
    () =>
      rankFeedPosts(posts, {
        citySlug: user?.citySlug ?? null,
        favoriteCategories: user?.favoriteCategories,
        interests: user?.interests,
        followingUsernames: new Set(),
      }),
    [posts, user]
  )

  const { sentinelRef } = useInfiniteScroll({ onLoadMore: loadMore, hasMore, loading: loadingMore })

  const pageTitle = isSubcategory && parentCat ? `${parentCat.name} · ${cat.name}` : cat.name
  const sectionLead = cat.name.toLocaleUpperCase('tr-TR')

  const centerHero = rankedPosts[0]
  const leftHero = rankedPosts[1]
  const rightStack = rankedPosts.slice(2, 4)
  const topFour = rankedPosts.slice(4, 8)
  const editorFour = rankedPosts.slice(8, 12)
  const featureFour = rankedPosts.slice(12, 16)
  const topicFour = rankedPosts.slice(16, 20)
  const moreList = rankedPosts.slice(20)

  return (
    <div className="desktop-category-page pb-10">
      <DesktopScrollHeader subcategories={subTabs} tabParent={tabParent} />

      <h1 className="mb-6 text-center font-serif text-3xl font-bold text-[rgb(var(--color-text))] md:text-4xl">
        {pageTitle}
      </h1>

      {topSlot ? <div className="mb-8">{topSlot}</div> : null}

      <DesktopAdBanner slot={`category-${cat.id}-top`} size="large" className="mb-8" />

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
          <div className={cn('col-span-12 min-w-0', leftHero ? 'md:col-span-6 xl:col-span-6' : 'md:col-span-9 xl:col-span-9')}>
            <GridStory post={centerHero} size="xl" />
          </div>
          {rightStack.length > 0 ? (
            <aside className="col-span-12 flex min-w-0 flex-col gap-1 md:col-span-3 xl:col-span-3" aria-label="Son haberler">
              {rightStack.map((post) => (
                <StackedStory key={post.id} post={post} />
              ))}
            </aside>
          ) : null}
        </section>
      ) : null}

      {topFour.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Öne çıkanlar">
          <DesktopSectionHeader title={`${sectionLead} Gündem`} href={ROUTES.CATEGORY(cat.slug)} />
          <div className={FOUR_CARD_GRID}>
            {topFour.map((post) => (
              <GridStory key={post.id} post={post} />
            ))}
          </div>
        </section>
      ) : null}

      {editorFour.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Editör seçimi">
          <DesktopSectionHeader title="Editörün Seçimi" href={ROUTES.CATEGORY(cat.slug)} />
          <div className={FOUR_CARD_GRID}>
            {editorFour.map((post) => (
              <GridStory key={post.id} post={post} />
            ))}
          </div>
        </section>
      ) : null}

      <DesktopCategoryWatch posts={rankedPosts} categorySlug={cat.slug} />

      {featureFour.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Derinlemesine">
          <DesktopSectionHeader title="Derinlemesine" href={ROUTES.CATEGORY(cat.slug)} />
          <div className={FOUR_CARD_GRID}>
            {featureFour.map((post) => (
              <GridStory key={post.id} post={post} />
            ))}
          </div>
        </section>
      ) : null}

      {topicFour.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Öne çıkan haberler">
          <DesktopSectionHeader title="Öne Çıkan" href={ROUTES.CATEGORY(cat.slug)} />
          <div className={FOUR_CARD_GRID}>
            {topicFour.map((post) => (
              <GridStory key={post.id} post={post} />
            ))}
          </div>
        </section>
      ) : null}

      <DesktopAdBanner slot={`category-${cat.id}-mid`} className="mb-10" />

      <DesktopMoreList
        posts={moreList}
        href={ROUTES.CATEGORY(cat.slug)}
        loadingMore={loadingMore}
        sentinelRef={sentinelRef}
      />

      {!loading && rankedPosts.length === 0 ? (
        <div className="mb-10 border border-dashed border-[rgb(var(--color-border))] py-16 text-center">
          <p className="text-lg font-semibold text-[rgb(var(--color-text))]">Bu kategoride haber yok</p>
          <Link href={ROUTES.FEED} className="mt-3 inline-block text-sm font-semibold text-[rgb(var(--color-brand))] hover:underline">
            Ana sayfaya dön
          </Link>
        </div>
      ) : null}

      <DesktopAdBanner slot={`category-${cat.id}-bottom`} size="large" className="mb-10" />
      <DesktopHomeFooter />
    </div>
  )
}
