'use client'

import { Suspense, useState } from 'react'
import { CategoryFeed } from '@/components/feed/CategoryFeed'
import { CategoryBbcPageHeader } from '@/components/category/CategoryBbcPageHeader'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { DesktopCategoryPage } from '@/components/home/desktop/DesktopCategoryPage'
import { WorldCupCategoryTabs } from '@/components/sports/WorldCupCategoryTabs'
import { SporCategoryExtras } from '@/components/sports/SporCategoryExtras'
import { BorsaWidgetClient } from '@/components/widgets/BorsaWidgetClient'
import type { CategoryDef } from '@/constants/config'
import type { TimelinePost } from '@/types/post'
import { AdSlotProvider } from '@/context/AdSlotContext'
import type { WorldCup2026Data } from '@/services/sportsApi/worldCup2026'

interface SubTab {
  id: string
  slug: string
  name: string
  color: string
  href: string
  active: boolean
}

interface CategoryPageClientProps {
  cat: CategoryDef
  headerCat: CategoryDef
  isSubcategory: boolean
  parentCat: CategoryDef | null
  subTabs: SubTab[]
  tabParent: CategoryDef | null
  showTabs: boolean
  initialPosts: TimelinePost[]
  worldCupData?: WorldCup2026Data | null
}

function CategoryTopExtras({
  cat,
  worldCupData,
  wcTab,
  onWcTabChange,
}: {
  cat: CategoryDef
  worldCupData?: WorldCup2026Data | null
  wcTab: string
  onWcTabChange: (tab: string) => void
}) {
  if (cat.id === 'dunya-kupasi-2026' && worldCupData) {
    return (
      <WorldCupCategoryTabs
        data={worldCupData}
        activeTab={wcTab}
        onTabChange={onWcTabChange}
      />
    )
  }
  if (cat.id === 'spor') return <SporCategoryExtras />
  if (cat.id === 'borsa') return <BorsaWidgetClient />
  return null
}

export function CategoryPageClient({
  cat,
  isSubcategory,
  parentCat,
  subTabs,
  tabParent,
  showTabs,
  initialPosts,
  worldCupData,
}: CategoryPageClientProps) {
  const [wcTab, setWcTab] = useState('haberler')
  const isWorldCup = cat.id === 'dunya-kupasi-2026' && Boolean(worldCupData)
  const showNewsFeed = !isWorldCup || wcTab === 'haberler'

  const pageTitle =
    isSubcategory && parentCat ? `${parentCat.name} · ${cat.name}` : cat.name

  const topExtras = (
    <CategoryTopExtras
      cat={cat}
      worldCupData={worldCupData}
      wcTab={wcTab}
      onWcTabChange={setWcTab}
    />
  )

  const feedFallback = (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <TimelineItemSkeleton key={i} />
      ))}
    </div>
  )

  return (
    <>
      {/* Mobil + tablet — BBC kategori şablonu */}
      <div className="bbc-category-page lg:hidden w-full">
        <CategoryBbcPageHeader
          pageTitle={pageTitle}
          subTabs={showTabs ? subTabs : []}
          tabParentSlug={tabParent?.slug}
          isSubcategory={isSubcategory}
          categoryId={cat.id}
          stickySubnav
          className="mb-6 px-1"
        />

        {topExtras ? <div className="mb-6">{topExtras}</div> : null}

        {showNewsFeed ? (
          <Suspense fallback={feedFallback}>
            <CategoryFeed categoryId={cat.id} initialPosts={initialPosts} />
          </Suspense>
        ) : null}
      </div>

      {/* Desktop — BBC kategori şablonu */}
      <div className="hidden lg:block">
        <AdSlotProvider page="category" categoryId={cat.id}>
          <DesktopCategoryPage
            cat={cat}
            headerCat={cat}
            isSubcategory={isSubcategory}
            parentCat={parentCat}
            subTabs={subTabs}
            tabParent={tabParent}
            initialPosts={initialPosts}
            topSlot={topExtras}
            showFeed={showNewsFeed}
            pageTitle={pageTitle}
            showTabs={showTabs}
          />
        </AdSlotProvider>
      </div>
    </>
  )
}
