'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getCategoryAccent } from '@/constants/categoryTheme'
import { ROUTES } from '@/constants/routes'

interface SubTab {
  id: string
  slug: string
  name: string
  href: string
  active: boolean
}

interface MobileCategoryHeaderProps {
  pageTitle: string
  categoryId: string
  isSubcategory?: boolean
  parentName?: string | null
  parentSlug?: string | null
  subTabs?: SubTab[]
  tabParentSlug?: string
}

export function MobileCategoryHeader({
  pageTitle,
  categoryId,
  isSubcategory = false,
  parentName,
  parentSlug,
  subTabs = [],
  tabParentSlug,
}: MobileCategoryHeaderProps) {
  const accent = getCategoryAccent(categoryId)
  const showSubNav = subTabs.length > 0 && tabParentSlug
  const style = { ['--mc-accent' as string]: accent.rgb } as React.CSSProperties

  return (
    <header className="mc-header" style={style}>
      {isSubcategory && parentName && parentSlug ? (
        <nav className="mc-breadcrumb" aria-label="Konum">
          <Link href={ROUTES.CATEGORY(parentSlug)} className="mc-breadcrumb__link">
            {parentName}
          </Link>
          <span className="mc-breadcrumb__sep" aria-hidden>
            ›
          </span>
          <span className="mc-breadcrumb__current">{pageTitle}</span>
        </nav>
      ) : (
        <p className="mc-kicker">{accent.kicker}</p>
      )}

      <h1 className="mc-title">{pageTitle}</h1>

      {showSubNav ? (
        <nav className="mc-subnav scrollbar-hide" aria-label="Alt kategoriler" data-no-category-swipe>
          <Link
            href={`/kategori/${tabParentSlug}`}
            className={cn('mc-chip', !isSubcategory && 'is-active')}
          >
            Tümü
          </Link>
          {subTabs.map((sub) => (
            <Link
              key={sub.id}
              href={sub.href}
              className={cn('mc-chip', sub.active && 'is-active')}
            >
              {sub.name}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
