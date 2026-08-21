'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buildCityHeaderNavItems } from '@/lib/citySidebarNav'
import { isCitySectionActive } from '@/lib/cityPaths'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { useCityTenant } from '@/store/cityTenantContext'
import { cn } from '@/lib/utils'

export function CitySectionNav() {
  const pathname = usePathname()
  const { categories, hasSpor } = useCityCategoryFilter()
  const tenant = useCityTenant()
  const items = buildCityHeaderNavItems(categories, {
    hasSpor,
    citySlug: tenant?.provinceSlug,
  })

  return (
    <nav
      className="z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]"
      aria-label="Şehir bölümleri"
    >
      <div className="newspaper-layout-inner category-nav-scroller flex gap-1 overflow-x-auto py-2 scrollbar-hide">
        {items.map((item) => {
          const Icon = item.icon
          const active = isCitySectionActive(pathname, item.href)

          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-[rgb(var(--color-brand))] text-white shadow-sm'
                  : 'text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-surface-raised))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
