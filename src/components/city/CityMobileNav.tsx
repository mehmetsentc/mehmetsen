'use client'

import { memo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buildCitySectionNavItems } from '@/lib/citySidebarNav'
import { isCitySectionActive } from '@/lib/cityPaths'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { useCityTenant } from '@/store/cityTenantContext'
import { cn } from '@/lib/utils'

function CityMobileNavInner() {
  const pathname = usePathname()
  const { hasSpor } = useCityCategoryFilter()
  const tenant = useCityTenant()
  const items = buildCitySectionNavItems({
    hasSpor,
    citySlug: tenant?.provinceSlug,
  })

  return (
    <nav
      className="mobile-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-[var(--mobile-nav-inset-x)] pb-[calc(var(--safe-bottom,0px)+var(--mobile-nav-float-gap))] lg:hidden"
      aria-label="Şehir menü"
    >
      <div className="mobile-bottom-nav-pill pointer-events-auto">
        {items.map((item) => {
          const Icon = item.icon
          const active = isCitySectionActive(pathname, item.href)
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 items-center justify-center touch-manipulation"
            >
              <span
                className={cn(
                  'relative flex h-11 w-11 items-center justify-center rounded-[14px] transition-colors duration-150',
                  active ? 'bg-white/20 text-white' : 'text-white/90'
                )}
              >
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 2.35 : 1.85}
                />
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export const CityMobileNav = memo(CityMobileNavInner)
