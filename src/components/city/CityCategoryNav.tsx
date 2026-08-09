'use client'

import { usePathname } from 'next/navigation'
import { CategoryNav, type CategoryNavItem } from '@/components/layout/CategoryNav'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { isCityFeedPath } from '@/lib/cityPaths'

export function CityCategoryNav() {
  const pathname = usePathname()
  const { categories, activeCategoryId, setActiveCategoryId } = useCityCategoryFilter()

  if (!isCityFeedPath(pathname) || categories.length === 0) {
    return null
  }

  const navItems: CategoryNavItem[] = [
    { id: '__all', label: 'Hepsi', href: '/' },
    ...categories.map((cat) => ({
      id: cat.id,
      label: cat.name,
      href: '/',
    })),
  ]

  return (
    <CategoryNav
      categories={navItems}
      onCategorySelect={(id) => setActiveCategoryId(id)}
      activeCategoryId={activeCategoryId}
    />
  )
}
