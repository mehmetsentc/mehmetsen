'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { CategoryFeed } from '@/components/feed/CategoryFeed'
import { TimelineItemSkeleton } from '@/components/ui/Skeleton'
import { DesktopCategoryPage } from '@/components/home/desktop/DesktopCategoryPage'
import { WorldCupCategoryTabs } from '@/components/sports/WorldCupCategoryTabs'
import { BorsaWidgetClient } from '@/components/widgets/BorsaWidgetClient'
import type { CategoryDef } from '@/constants/config'
import type { TimelinePost } from '@/types/post'
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

function MobileCategoryHeader({
  headerCat,
  cat,
  isSubcategory,
  parentCat,
  showTabs,
  subTabs,
  tabParent,
}: Pick<
  CategoryPageClientProps,
  'headerCat' | 'cat' | 'isSubcategory' | 'parentCat' | 'showTabs' | 'subTabs' | 'tabParent'
>) {
  return (
    <>
      <div
        className="mb-3 flex items-center gap-3 rounded-2xl px-4 py-2.5"
        style={{ backgroundColor: `${headerCat.color}18`, borderLeft: `4px solid ${headerCat.color}` }}
      >
        <div>
          <h1 className="text-lg font-black tracking-tight text-[rgb(var(--color-text))]">
            {isSubcategory ? `${parentCat?.name} · ${cat.name}` : cat.name}
          </h1>
          <p className="text-[11px] text-[rgb(var(--color-muted))]">{cat.name} kategorisindeki son gelişmeler</p>
        </div>
      </div>

      {showTabs ? (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
          <Link
            href={`/kategori/${tabParent!.slug}`}
            className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
            style={
              !isSubcategory
                ? { backgroundColor: `${tabParent!.color}25`, color: tabParent!.color, borderColor: `${tabParent!.color}50` }
                : { borderColor: 'rgb(var(--color-border))', color: 'rgb(var(--color-muted))' }
            }
          >
            Tümü
          </Link>
          {subTabs.map((sub) => (
            <Link
              key={sub.id}
              href={sub.href}
              className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
              style={
                sub.active
                  ? { backgroundColor: `${sub.color}25`, color: sub.color, borderColor: `${sub.color}50` }
                  : { borderColor: 'rgb(var(--color-border))', color: 'rgb(var(--color-muted))' }
              }
            >
              {sub.name}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  )
}

export function CategoryPageClient({
  cat,
  headerCat,
  isSubcategory,
  parentCat,
  subTabs,
  tabParent,
  showTabs,
  initialPosts,
  worldCupData,
}: CategoryPageClientProps) {
  const borsaTop = cat.id === 'borsa' ? <BorsaWidgetClient /> : null

  return (
    <>
      {/* Mobil + tablet — mevcut akış */}
      <div className="lg:hidden w-full">
        <MobileCategoryHeader
          headerCat={headerCat}
          cat={cat}
          isSubcategory={isSubcategory}
          parentCat={parentCat}
          showTabs={showTabs}
          subTabs={subTabs}
          tabParent={tabParent}
        />

        {cat.id === 'dunya-kupasi-2026' && worldCupData ? (
          <WorldCupCategoryTabs initialPosts={initialPosts} data={worldCupData} />
        ) : (
          <>
            {borsaTop}
            {cat.id === 'borsa' ? (
              <div className="mb-4 flex items-center gap-2">
                <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
                <span className="text-xs font-semibold text-[rgb(var(--color-muted))]">Borsa Haberleri</span>
                <div className="h-px flex-1 bg-[rgb(var(--color-border))]" />
              </div>
            ) : null}
            <Suspense
              fallback={
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <TimelineItemSkeleton key={i} />
                  ))}
                </div>
              }
            >
              <CategoryFeed categoryId={cat.id} initialPosts={initialPosts} />
            </Suspense>
          </>
        )}
      </div>

      {/* Web (lg+) — BBC kategori düzeni */}
      <div className="hidden lg:block desktop-newspaper">
        {cat.id === 'dunya-kupasi-2026' && worldCupData ? (
          <>
            <DesktopCategoryPage
              cat={cat}
              headerCat={headerCat}
              isSubcategory={isSubcategory}
              parentCat={parentCat}
              subTabs={subTabs}
              tabParent={tabParent}
              initialPosts={initialPosts}
              topSlot={<WorldCupCategoryTabs initialPosts={initialPosts} data={worldCupData} />}
            />
          </>
        ) : (
          <DesktopCategoryPage
            cat={cat}
            headerCat={headerCat}
            isSubcategory={isSubcategory}
            parentCat={parentCat}
            subTabs={subTabs}
            tabParent={tabParent}
            initialPosts={initialPosts}
            topSlot={borsaTop}
          />
        )}
      </div>
    </>
  )
}
