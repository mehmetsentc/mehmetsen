'use client'

import type { ReactNode } from 'react'
import { DesktopMoreList } from '@/components/home/desktop/DesktopMoreList'
import { DesktopSectionHeader } from '@/components/home/desktop/DesktopSectionHeader'
import {
  CategoryFeatureStory,
  CategoryGridStory,
  CategoryHeroStory,
  CategoryTextStory,
} from '@/components/category/CategoryPostStories'
import { CategoryStoryRail } from '@/components/category/CategoryStoryRail'
import type { TimelinePost } from '@/types/post'

interface CategoryBbcSectionProps {
  title: string
  href: string
  posts: TimelinePost[]
  showHeader: boolean
  isFirstSection: boolean
  loading: boolean
  loadingMore: boolean
  accentRgb?: string
  beforeContent?: ReactNode
}

export function CategoryBbcSection({
  title,
  href,
  posts,
  showHeader,
  isFirstSection,
  loading,
  loadingMore,
  accentRgb,
  beforeContent,
}: CategoryBbcSectionProps) {
  const hero = posts[0]
  const sideFeatures = posts.slice(1, 3)
  const textList = posts.slice(3, 6)
  const gridStories = posts.slice(6, 11)
  const archive = posts.slice(11)

  const sectionLabel = showHeader ? title : isFirstSection ? 'Öne çıkanlar' : title

  const blockStyle = accentRgb
    ? ({ ['--cat-accent' as string]: accentRgb } as React.CSSProperties)
    : undefined

  return (
    <div className="bbc-category-block bbc-category-block--accent" style={blockStyle}>
      {showHeader || isFirstSection ? (
        <DesktopSectionHeader
          title={sectionLabel}
          href={showHeader ? href : undefined}
          variant="bbc"
        />
      ) : null}

      {beforeContent}

      {loading && posts.length === 0 ? (
        <div className="mb-10 grid grid-cols-12 gap-6">
          <div className="col-span-12 h-72 animate-pulse bg-[rgb(var(--color-border))]/30 lg:col-span-7" />
          <div className="col-span-12 space-y-4 lg:col-span-5">
            <div className="h-40 animate-pulse bg-[rgb(var(--color-border))]/30" />
            <div className="h-40 animate-pulse bg-[rgb(var(--color-border))]/30" />
          </div>
        </div>
      ) : null}

      {!loading && posts.length === 0 ? (
        <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">Henüz haber yok</p>
      ) : null}

      {hero ? (
        <div className="mb-10 grid grid-cols-12 gap-x-6 gap-y-8">
          <div className="col-span-12 min-w-0 lg:col-span-6 xl:col-span-7">
            <CategoryHeroStory post={hero} priority={isFirstSection} />
          </div>

          {sideFeatures.length > 0 ? (
            <div className="col-span-12 min-w-0 lg:col-span-3">
              {sideFeatures.map((post) => (
                <CategoryFeatureStory key={post.id} post={post} />
              ))}
            </div>
          ) : null}

          {textList.length > 0 ? (
            <aside
              className="col-span-12 min-w-0 lg:col-span-3"
              aria-label="Son başlıklar"
            >
              {textList.map((post) => (
                <CategoryTextStory key={post.id} post={post} />
              ))}
            </aside>
          ) : null}

          {sideFeatures.length === 0 && textList.length === 0 && posts.length > 1 ? (
            <div className="col-span-12 grid grid-cols-2 gap-4 lg:col-span-6 xl:col-span-5">
              {posts.slice(1, 5).map((post) => (
                <CategoryGridStory key={post.id} post={post} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {gridStories.length > 0 ? (
        <CategoryStoryRail
          title="Keşfet"
          posts={gridStories}
          accentRgb={accentRgb}
          className="mb-10"
        />
      ) : null}

      {archive.length > 0 ? (
        <DesktopMoreList posts={archive} title="Daha fazla" href={href} />
      ) : null}

      {loadingMore ? (
        <p className="py-6 text-center text-sm text-[rgb(var(--color-muted))]">Arşiv yükleniyor…</p>
      ) : null}
    </div>
  )
}
