'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { FEED_FALLBACK_LOGO } from '@/lib/feedMediaUtils'
import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopCategoryWatch } from '@/components/home/desktop/DesktopCategoryWatch'
import { DesktopHomeFooter } from '@/components/home/desktop/DesktopHomeFooter'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import { DesktopWebHeader } from '@/components/home/desktop/DesktopWebHeader'
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

function GridStory({ post, size = 'md' }: { post: TimelinePost; size?: 'md' | 'lg' | 'xl' }) {
  const href = categoryPostHref(post)
  const image = categoryPostImage(post) || FEED_FALLBACK_LOGO
  const summary = categoryPostSummary(post)

  const aspect =
    size === 'xl' ? 'aspect-[16/10]' : size === 'lg' ? 'aspect-[16/10]' : 'aspect-video'
  const titleSize =
    size === 'xl' ? 'text-2xl md:text-3xl' : size === 'lg' ? 'text-xl' : 'text-base'

  return (
    <article>
      <Link href={href} className="group block">
        <div className={cn('relative mb-3 overflow-hidden bg-[rgb(var(--color-border))]', aspect)}>
          <SafeNewsImage
            src={image}
            alt={post.title}
            fill
            sizes="(max-width: 1280px) 33vw, 400px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
        <h3 className={cn('font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline', titleSize)}>
          {post.title}
        </h3>
        {summary ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[rgb(var(--color-muted))]">{summary}</p>
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
    <article className="border-b border-[rgb(var(--color-border))] pb-5 last:border-b-0 last:pb-0">
      <Link href={href} className="group block">
        <div className="relative mb-2 aspect-[16/10] overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage src={image} alt={post.title} fill sizes="280px" className="object-cover group-hover:scale-[1.02] transition-transform" />
        </div>
        <h3 className="text-sm font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">{post.title}</h3>
        {summary ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[rgb(var(--color-muted))]">{summary}</p> : null}
      </Link>
    </article>
  )
}

function TextLinkStory({ post }: { post: TimelinePost }) {
  const href = categoryPostHref(post)
  return (
    <article className="border-t border-[rgb(var(--color-border))] py-3 first:border-t-0 first:pt-0">
      <Link href={href} className="group block text-sm font-bold leading-snug text-[rgb(var(--color-text))] hover:underline">
        {post.title}
      </Link>
    </article>
  )
}

function ThemeColumn({
  title,
  href,
  lead,
  links,
}: {
  title: string
  href: string
  lead: TimelinePost
  links: TimelinePost[]
}) {
  const leadHref = categoryPostHref(lead)
  const leadImage = categoryPostImage(lead) || FEED_FALLBACK_LOGO
  const leadSummary = categoryPostSummary(lead)

  return (
    <div className="min-w-0">
      <DesktopSectionHeader title={title} href={href} />
      <Link href={leadHref} className="group mb-1 block">
        <div className="relative mb-3 aspect-[4/3] overflow-hidden bg-[rgb(var(--color-border))]">
          <SafeNewsImage src={leadImage} alt={lead.title} fill sizes="320px" className="object-cover group-hover:scale-[1.02] transition-transform" />
        </div>
        <h3 className="text-base font-bold leading-snug text-[rgb(var(--color-text))] group-hover:underline">{lead.title}</h3>
        {leadSummary ? <p className="mt-2 line-clamp-3 text-sm text-[rgb(var(--color-muted))]">{leadSummary}</p> : null}
      </Link>
      {links.map((post) => (
        <TextLinkStory key={post.id} post={post} />
      ))}
    </div>
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
  const heatPair = rankedPosts.slice(4, 6)
  const wellnessGrid = rankedPosts.slice(6, 9)
  const featurePair = rankedPosts.slice(9, 11)
  const themePosts = rankedPosts.slice(11, 23)
  const moreList = rankedPosts.slice(23)

  const themeColumns = useMemo(() => {
    const tabs = subTabs.filter((t) => !t.active).slice(0, 4)
    if (tabs.length >= 4) {
      return tabs.map((tab, i) => ({
        title: tab.name.toLocaleUpperCase('tr-TR'),
        href: tab.href,
        lead: themePosts[i * 4] ?? themePosts[i],
        links: themePosts.slice(i * 4 + 1, i * 4 + 4).filter(Boolean),
      })).filter((col) => col.lead)
    }
    const fallbackTitles = ['Öne Çıkan', 'Gündem', 'Analiz', 'Son Gelişmeler']
    return fallbackTitles.map((title, i) => ({
      title,
      href: ROUTES.CATEGORY(cat.slug),
      lead: themePosts[i * 3],
      links: themePosts.slice(i * 3 + 1, i * 3 + 4).filter(Boolean),
    })).filter((col) => col.lead)
  }, [subTabs, themePosts, cat.slug])

  return (
    <div className="desktop-category-page pb-10">
      <DesktopWebHeader subcategories={subTabs} tabParent={tabParent} />

      <h1 className="mb-6 text-center font-serif text-3xl font-bold text-[rgb(var(--color-text))] md:text-4xl">
        {pageTitle}
      </h1>

      {topSlot ? <div className="mb-8">{topSlot}</div> : null}

      <DesktopAdBanner slot={`category-${cat.id}-top`} size="large" className="mb-8" />

      {centerHero ? (
        <section
          className="mb-10 grid grid-cols-12 gap-6 border-b border-[rgb(var(--color-border))] pb-10"
          aria-label="Öne çıkan haberler"
        >
          {leftHero ? (
            <div className="col-span-12 md:col-span-3">
              <GridStory post={leftHero} />
            </div>
          ) : null}
          <div className={cn('col-span-12', leftHero ? 'md:col-span-6' : 'md:col-span-9')}>
            <GridStory post={centerHero} size="xl" />
          </div>
          {rightStack.length > 0 ? (
            <aside className="col-span-12 md:col-span-3 flex flex-col gap-5" aria-label="Son haberler">
              {rightStack.map((post) => (
                <StackedStory key={post.id} post={post} />
              ))}
            </aside>
          ) : null}
        </section>
      ) : null}

      {heatPair.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Gündem">
          <DesktopSectionHeader title={`${sectionLead} Gündem`} href={ROUTES.CATEGORY(cat.slug)} />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {heatPair.map((post) => (
              <GridStory key={post.id} post={post} size="lg" />
            ))}
          </div>
        </section>
      ) : null}

      {wellnessGrid.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Editör seçimi">
          <DesktopSectionHeader title="Editörün Seçimi" href={ROUTES.CATEGORY(cat.slug)} />
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-9">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                {wellnessGrid.map((post) => (
                  <GridStory key={post.id} post={post} />
                ))}
              </div>
            </div>
            <div className="col-span-12 lg:col-span-3">
              <DesktopAdBanner slot={`category-${cat.id}-skyscraper`} size="skyscraper" />
            </div>
          </div>
        </section>
      ) : null}

      <DesktopCategoryWatch posts={rankedPosts} categorySlug={cat.slug} />

      {featurePair.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Derinlemesine">
          <DesktopSectionHeader title="Derinlemesine" href={ROUTES.CATEGORY(cat.slug)} />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {featurePair.map((post) => (
              <GridStory key={post.id} post={post} size="lg" />
            ))}
          </div>
        </section>
      ) : null}

      {themeColumns.length > 0 ? (
        <section className="mb-10 border-b border-[rgb(var(--color-border))] pb-10" aria-label="Konu başlıkları">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {themeColumns.map((col) => (
              <ThemeColumn
                key={col.title}
                title={col.title}
                href={col.href}
                lead={col.lead}
                links={col.links}
              />
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
