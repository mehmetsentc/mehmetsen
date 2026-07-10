'use client'

import { DesktopAdBanner } from '@/components/home/desktop/DesktopAdBanner'
import { DesktopHomeFooter } from '@/components/home/desktop/DesktopHomeFooter'
import { CategoryThemedFeed } from '@/components/category/CategoryThemedFeed'
import { useScrollHeaderConfig } from '@/context/ScrollHeaderContext'
import { getCache } from '@/lib/clientCache'
import { PAGE_CACHE_KEYS } from '@/lib/pageCache'
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

export function DesktopCategoryPage({
  cat,
  isSubcategory,
  parentCat,
  subTabs,
  tabParent,
  initialPosts,
  topSlot,
}: DesktopCategoryPageProps) {
  useScrollHeaderConfig({ subcategories: subTabs, tabParent })

  const cacheKey = PAGE_CACHE_KEYS.category(cat.id)
  const cachedPosts = initialPosts.length ? initialPosts : (getCache<TimelinePost[]>(cacheKey) ?? [])

  const pageTitle = isSubcategory && parentCat ? `${parentCat.name} · ${cat.name}` : cat.name

  return (
    <div className="desktop-category-page desktop-category-page--bbc mx-auto max-w-[1280px] pb-10">
      <header className="mb-6 border-b border-[rgb(var(--color-border))] pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-[rgb(var(--color-text))] md:text-4xl">
          {pageTitle}
        </h1>
      </header>

      {topSlot ? <div className="mb-8">{topSlot}</div> : null}

      <DesktopAdBanner slot={`category-${cat.id}-top`} size="large" className="mb-8" />

      <CategoryThemedFeed
        parentCategoryId={cat.id}
        initialPosts={cachedPosts}
        variant="desktop"
      />

      <DesktopAdBanner slot={`category-${cat.id}-bottom`} size="large" className="mb-10" />
      <DesktopHomeFooter />
    </div>
  )
}
