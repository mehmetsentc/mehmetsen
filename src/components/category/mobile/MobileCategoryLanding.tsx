'use client'

import { useMemo } from 'react'
import { getCategoryAccent } from '@/constants/categoryTheme'
import {
  composeMobileCategoryLayout,
  type MobileCategoryBlock,
  type MobileStorySlot,
} from '@/lib/mobileCategoryComposition'
import { categoryPostImage } from '@/components/home/desktop/categoryPostUtils'
import { CategoryHeroCarousel } from '@/components/category/CategoryHeroCarousel'
import { MobileCategoryHeader } from './MobileCategoryHeader'
import { MobileYerelCityStrip } from './MobileYerelCityStrip'
import { MobileCategoryStory } from './MobileCategoryStories'
import { MobileLatestStrip } from './MobileLatestStrip'
import { CategoryLoadMore } from '@/components/category/CategoryLoadMore'
import { previousTurkeyDayFromPublishedAt } from '@/lib/turkeyCalendar'
import Link from 'next/link'
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
  heroCarouselPosts,
}: {
  block: MobileCategoryBlock
  isFirstHero?: boolean
  /** When set, first hero becomes a multi-slide carousel instead of a single card. */
  heroCarouselPosts?: TimelinePost[]
}) {
  if (block.type === 'hero') {
    if (heroCarouselPosts && heroCarouselPosts.length > 0) {
      return (
        <div className="mc-hero-carousel px-0">
          <CategoryHeroCarousel
            posts={heroCarouselPosts}
            priority={isFirstHero}
            limit={20}
          />
        </div>
      )
    }
    if (block.slots[0]) {
      return (
        <MobileCategoryStory
          variant="hero"
          post={block.slots[0].post}
          priority={isFirstHero}
        />
      )
    }
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
 * Mobile-only (<768px) editorial category landing.
 *
 * COST REDUCTION: Infinite scroll ve client-side Firestore okuma kaldırıldı.
 * Açılış blokları SSR initialPosts'tan oluşturulur (sıfır Firestore okuma).
 * "Daha fazla yükle" butonu /api/feed/category (server-cached, 5 dk) çağırır.
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
  const accent = getCategoryAccent(cat.id)
  const style = { ['--mc-accent' as string]: accent.rgb } as React.CSSProperties

  // Açılış editorial layout — SSR verisi, Firestore okuma yok
  const openingBlocks = useMemo(
    () => composeMobileCategoryLayout({ posts: initialPosts, sections: [], isSubcategory: true }),
    [initialPosts]
  )

  // Kaydırmalı öne çıkan: görselli haberlerden ilk 20 (tek hero yerine)
  const heroCarouselPosts = useMemo(() => {
    const withImage = initialPosts.filter((p) => categoryPostImage(p).length > 10)
    return (withImage.length > 0 ? withImage : initialPosts).slice(0, 20)
  }, [initialPosts])

  // Load-more starts from the day before the oldest SSR post
  const lastPost = initialPosts[initialPosts.length - 1]
  const initialBeforeDay = previousTurkeyDayFromPublishedAt(
    lastPost?.publishedAt == null
      ? undefined
      : typeof lastPost.publishedAt === 'number'
        ? lastPost.publishedAt
        : String(lastPost.publishedAt)
  )

  const empty = initialPosts.length === 0

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

      {empty ? (
        <p className="mc-empty">Bu kategoride henüz yayınlanmış haber bulunmuyor.</p>
      ) : null}

      {openingBlocks.map((block, i) => (
        <BlockView
          key={`open-${block.type}-${i}-${block.slots[0]?.post.id ?? block.latestTitles?.[0]?.id ?? i}`}
          block={block}
          isFirstHero={i === 0}
          heroCarouselPosts={
            block.type === 'hero' && i === openingBlocks.findIndex((b) => b.type === 'hero')
              ? heroCarouselPosts
              : undefined
          }
        />
      ))}

      {/* Sunucu taraflı sayfalama — client Firestore okuma yok */}
      <div className="px-4 pt-2 pb-8">
        <CategoryLoadMore
          categoryId={cat.id}
          initialItems={initialPosts.map((p) => ({
            id: p.id,
            slug: p.slug ?? p.id,
            title: p.title ?? '',
          }))}
          initialBeforeDay={initialBeforeDay}
          initialHasMore={initialPosts.length > 0}
        />
      </div>
    </div>
  )
}
