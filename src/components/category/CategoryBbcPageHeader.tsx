'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { BackNavButton } from '@/components/layout/BackNavButton'
import { ROUTES } from '@/constants/routes'

interface SubTab {
  id: string
  slug: string
  name: string
  href: string
  active: boolean
}

interface CategoryBbcPageHeaderProps {
  pageTitle: string
  subTabs?: SubTab[]
  tabParentSlug?: string
  isSubcategory?: boolean
  className?: string
  /** Category id used to derive the accent colour + kicker. */
  categoryId?: string
  /** Sticky sub-nav (mobile) — chips pin under the app header on scroll. */
  stickySubnav?: boolean
}

export function CategoryBbcPageHeader({
  pageTitle,
  subTabs = [],
  tabParentSlug,
  isSubcategory = false,
  className,
  categoryId,
  stickySubnav = false,
}: CategoryBbcPageHeaderProps) {
  const showSubNav = subTabs.length > 0 && tabParentSlug
  const accent = getCategoryAccent(categoryId ?? '')
  const style = { ['--cat-accent' as string]: accent.rgb } as React.CSSProperties

  const backFallback =
    isSubcategory && tabParentSlug
      ? ROUTES.CATEGORY(tabParentSlug)
      : ROUTES.FEED

  return (
    <header className={cn('bbc-category-header bbc-category-header--accent', className)} style={style}>
      <div className="bbc-category-header__top">
        <BackNavButton
          fallbackHref={backFallback}
          className="back-nav-btn--inline max-lg:hidden"
        />
        <div className="min-w-0 flex-1">
          <span className="bbc-category-kicker">{accent.kicker}</span>
          <h1 className="bbc-category-title">{pageTitle}</h1>
        </div>
      </div>
      {showSubNav ? (
        <nav
          className={cn(
            'bbc-category-subnav mt-4 flex gap-2 overflow-x-auto scrollbar-hide',
            stickySubnav && 'bbc-category-subnav--sticky'
          )}
          aria-label="Alt kategoriler"
        >
          <Link
            href={`/kategori/${tabParentSlug}`}
            className={cn('bbc-category-chip', !isSubcategory && 'is-active')}
          >
            Tümü
          </Link>
          {subTabs.map((sub) => (
            <Link
              key={sub.id}
              href={sub.href}
              className={cn('bbc-category-chip', sub.active && 'is-active')}
            >
              {sub.name}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
