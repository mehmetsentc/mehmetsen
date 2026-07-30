'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  getCategorySectionDef,
  getCategorySectionHref,
  getThemedCategorySectionIds,
} from '@/constants/categorySections'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { useThemedCategoryFeed } from '@/hooks/useThemedCategoryFeed'
import {
  appendFeedSlots,
  collectRenderedIds,
  composeMobileCategoryLayout,
  type MobileCategoryBlock,
  type MobileStorySlot,
} from '@/lib/mobileCategoryComposition'
import { MobileCategoryHeader } from './MobileCategoryHeader'
import { MobileLatestStrip } from './MobileLatestStrip'
import { MobileCategoryStory } from './MobileCategoryStories'
import { MobileYerelCityStrip } from './MobileYerelCityStrip'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
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

interface MobileCategoryLandingProps {
  cat: CategoryDef
  isSubcategory: boolean
  parentCat: CategoryDef | null
  subTabs: SubTab[]
  tabParent: CategoryDef | null
  showTabs: boolean
  initialPosts: TimelinePost[]
  pageTitle: string
  topExtras?: React.ReactNode
}

function sectionTitle(sectionId: string): string {
  const def = getCategorySectionDef(sectionId)
  if (!def) return sectionId
  const parent = DEFAULT_CATEGORIES.find((c) => c.id === def.parentId)
  if (parent && sectionId !== parent.id) return def.name
  return def.name
}

function SectionVisibilityTrigger({
  onVisible,
  enabled,
}: {
  onVisible: () => void
  enabled: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !firedRef.current) {
          firedRef.current = true
          onVisible()
        }
      },
      { rootMargin: '280px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onVisible, enabled])

  return <div ref={ref} className="h-px" aria-hidden />
}

function LoadMoreSentinel({
  onLoadMore,
  loading,
  hasMore,
}: {
  onLoadMore: () => void
  loading: boolean
  hasMore: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) onLoadMore()
      },
      { rootMargin: '480px', threshold: 0.01 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onLoadMore, loading, hasMore])

  return <div ref={ref} className="h-1" aria-hidden />
}

function StoryStack({ slots, priorityFirst }: { slots: MobileStorySlot[]; priorityFirst?: boolean }) {
  return (
    <div className="mc-stack">
      {slots.map((slot, i) => (
        <MobileCategoryStory
          key={slot.post.id}
          variant={slot.variant}
          post={slot.post}
          priority={Boolean(priorityFirst && i === 0)}
        />
      ))}
    </div>
  )
}

function BlockView({
  block,
  isFirstHero,
}: {
  block: MobileCategoryBlock
  isFirstHero?: boolean
}) {
  if (block.type === 'hero' && block.slots[0]) {
    return (
      <MobileCategoryStory
        variant="hero"
        post={block.slots[0].post}
        priority={isFirstHero}
      />
    )
  }

  if (block.type === 'latest' && block.latestTitles) {
    return <MobileLatestStrip items={block.latestTitles} />
  }

  if (block.type === 'videos') {
    return (
      <section className="mc-section" aria-label={block.title ?? 'Video'}>
        {block.title ? <h2 className="mc-section__title">{block.title}</h2> : null}
        <div className="mc-stack mc-stack--video">
          {block.slots.map((slot) => (
            <MobileCategoryStory key={slot.post.id} variant="video" post={slot.post} />
          ))}
        </div>
      </section>
    )
  }

  if (block.type === 'section') {
    return (
      <section className="mc-section" aria-label={block.title}>
        <div className="mc-section__head">
          {block.href ? (
            <Link href={block.href} className="mc-section__title-link">
              <h2 className="mc-section__title">{block.title}</h2>
            </Link>
          ) : (
            <h2 className="mc-section__title">{block.title}</h2>
          )}
        </div>
        <StoryStack slots={block.slots} />
      </section>
    )
  }

  if (block.type === 'feed') {
    return (
      <section className="mc-section" aria-label={block.title ?? 'Son Haberler'}>
        {block.title ? <h2 className="mc-section__title">{block.title}</h2> : null}
        <StoryStack slots={block.slots} />
      </section>
    )
  }

  return <StoryStack slots={block.slots} />
}

/**
 * Mobile-only (<768px) editorial category / subcategory landing.
 * Opening layout is frozen from server initialPosts so lazy section loads
 * do not reshuffle the top of the page.
 */
export function MobileCategoryLanding({
  cat,
  isSubcategory,
  parentCat,
  subTabs,
  tabParent,
  showTabs,
  initialPosts,
  pageTitle,
  topExtras,
}: MobileCategoryLandingProps) {
  const sectionIds = useMemo(() => getThemedCategorySectionIds(cat.id), [cat.id])
  const accent = getCategoryAccent(cat.id)
  const style = { ['--mc-accent' as string]: accent.rgb } as React.CSSProperties

  const { sections, activated, ensureSectionLoaded, loadMoreSection } = useThemedCategoryFeed(
    sectionIds,
    initialPosts
  )

  const bootedRef = useRef(false)
  useEffect(() => {
    if (bootedRef.current) return
    const first = sectionIds[0]
    if (!first) return
    bootedRef.current = true
    ensureSectionLoaded(first)
  }, [sectionIds, ensureSectionLoaded])

  // Stable opening from SSR posts only — never reshuffles when more sections load
  const openingBlocks = useMemo(
    () =>
      composeMobileCategoryLayout({
        posts: initialPosts,
        sections: [],
        isSubcategory: true, // force opening-only (no sibling sections here)
      }),
    [initialPosts]
  )

  const openingIds = useMemo(() => collectRenderedIds(openingBlocks), [openingBlocks])

  const siblingSectionBlocks = useMemo(() => {
    if (isSubcategory) return [] as MobileCategoryBlock[]
    const used = new Set(openingIds)
    const blocks: MobileCategoryBlock[] = []

    for (const sectionId of sectionIds) {
      if (sectionId === cat.id) continue
      const state = sections[sectionId]
      const posts = state?.posts ?? []
      if (posts.length === 0) continue
      const slots = appendFeedSlots(posts, used, 0).slice(0, 4)
      // Prefer large-first for section identity
      if (slots[0]) slots[0] = { ...slots[0], variant: slots[0].variant === 'text' ? 'text' : 'large' }
      if (slots.length === 0) continue
      blocks.push({
        type: 'section',
        title: sectionTitle(sectionId),
        href: getCategorySectionHref(sectionId),
        slots,
      })
    }
    return blocks
  }, [isSubcategory, sectionIds, cat.id, sections, openingIds])

  const renderedIds = useMemo(() => {
    const ids = new Set(openingIds)
    for (const b of siblingSectionBlocks) {
      for (const s of b.slots) ids.add(s.post.id)
    }
    return ids
  }, [openingIds, siblingSectionBlocks])

  const primarySectionId = isSubcategory
    ? sectionIds[0]
    : (sectionIds.includes(cat.id) ? cat.id : sectionIds[sectionIds.length - 1])

  const primaryState = primarySectionId ? sections[primarySectionId] : undefined

  const extraFeedSlots = useMemo(() => {
    if (!primaryState?.posts.length) return [] as MobileStorySlot[]
    const ids = new Set(renderedIds)
    return appendFeedSlots(primaryState.posts, ids, openingBlocks.length)
  }, [primaryState?.posts, renderedIds, openingBlocks.length])

  const loadingInitial =
    initialPosts.length === 0 &&
    Boolean(primaryState && !primaryState.loaded && (primaryState.loading || !primaryState.loaded))

  const empty =
    !loadingInitial &&
    initialPosts.length === 0 &&
    (!primaryState || (primaryState.loaded && primaryState.posts.length === 0))

  return (
    <div className="mc-page" style={style}>
      <MobileCategoryHeader
        pageTitle={isSubcategory && parentCat ? cat.name : pageTitle.includes('·') ? cat.name : pageTitle}
        categoryId={cat.id}
        isSubcategory={isSubcategory}
        parentName={parentCat?.name}
        parentSlug={parentCat?.slug}
        subTabs={showTabs ? subTabs : []}
        tabParentSlug={tabParent?.slug}
      />

      {topExtras ? <div className="mc-extras">{topExtras}</div> : null}

      {cat.id === 'yerel-haber' ? <MobileYerelCityStrip /> : null}

      {loadingInitial ? (
        <div className="mc-skeletons">
          <div className="mc-skel mc-skel--hero" />
          <div className="mc-skel mc-skel--line" />
          <div className="mc-skel mc-skel--large" />
          <div className="mc-skel mc-skel--compact" />
          <div className="mc-skel mc-skel--compact" />
        </div>
      ) : null}

      {empty ? (
        <p className="mc-empty">Bu kategoride henüz yayınlanmış haber bulunmuyor.</p>
      ) : null}

      {openingBlocks.map((block, i) => (
        <BlockView
          key={`open-${block.type}-${i}-${block.slots[0]?.post.id ?? block.latestTitles?.[0]?.id ?? i}`}
          block={block}
          isFirstHero={i === 0}
        />
      ))}

      {!isSubcategory
        ? sectionIds
            .filter((id) => id !== cat.id)
            .map((sectionId) => (
              <SectionVisibilityTrigger
                key={`vis-${sectionId}`}
                onVisible={() => ensureSectionLoaded(sectionId)}
                enabled={activated}
              />
            ))
        : null}

      {siblingSectionBlocks.map((block, i) => (
        <BlockView key={`sec-${block.title}-${i}`} block={block} />
      ))}

      {!isSubcategory
        ? sectionIds
            .filter((id) => id !== cat.id)
            .map((sectionId) => {
              const state = sections[sectionId]
              if (!state?.loading || state.loaded) return null
              return (
                <div key={`sk-${sectionId}`} className="mc-skeletons">
                  <TimelineItemSkeleton />
                </div>
              )
            })
        : null}

      {extraFeedSlots.length > 0 ? (
        <section className="mc-section" aria-label="Son Haberler">
          {openingBlocks.some((b) => b.type === 'feed') ? null : (
            <h2 className="mc-section__title" style={{ paddingInline: '1rem', marginBottom: '1.25rem' }}>
              Son Haberler
            </h2>
          )}
          <StoryStack slots={extraFeedSlots} />
        </section>
      ) : null}

      {primaryState?.loadingMore ? (
        <div className="mc-skeletons">
          <div className="mc-skel mc-skel--compact" />
          <div className="mc-skel mc-skel--compact" />
        </div>
      ) : null}

      {primarySectionId && primaryState ? (
        <LoadMoreSentinel
          onLoadMore={() => loadMoreSection(primarySectionId)}
          loading={primaryState.loadingMore || primaryState.loading}
          hasMore={primaryState.hasMore}
        />
      ) : null}
    </div>
  )
}
