'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

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
}

export function CategoryBbcPageHeader({
  pageTitle,
  subTabs = [],
  tabParentSlug,
  isSubcategory = false,
  className,
}: CategoryBbcPageHeaderProps) {
  const showSubNav = subTabs.length > 0 && tabParentSlug

  return (
    <header className={cn('bbc-category-header', className)}>
      <h1 className="bbc-category-title">{pageTitle}</h1>
      {showSubNav ? (
        <nav
          className="bbc-category-subnav mt-5 flex gap-0 overflow-x-auto scrollbar-hide"
          aria-label="Alt kategoriler"
        >
          <Link
            href={`/kategori/${tabParentSlug}`}
            className={cn('bbc-category-subnav-item', !isSubcategory && 'is-active')}
          >
            Tümü
          </Link>
          {subTabs.map((sub) => (
            <Link
              key={sub.id}
              href={sub.href}
              className={cn('bbc-category-subnav-item', sub.active && 'is-active')}
            >
              {sub.name}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
