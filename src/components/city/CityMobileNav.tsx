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
      className="fixed bottom-0 left-0 right-0 z-[105] border-t border-[rgb(var(--color-nav-bar-border))] bg-[rgb(var(--color-nav-bar))] lg:hidden"
      aria-label="Şehir menü"
    >
      <div
        className="flex items-end pb-[var(--safe-bottom)]"
        style={{ height: 'calc(3.5rem + var(--safe-bottom, 0px))' }}
      >
        {items.map((item) => {
          const Icon = item.icon
          const active = isCitySectionActive(pathname, item.href)
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch
              aria-label={item.label}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors',
                active
                  ? 'text-[rgb(var(--color-nav-active))]'
                  : 'text-[rgb(var(--color-nav-inactive))]'
              )}
            >
              <Icon
                className="h-[22px] w-[22px]"
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span
                className={cn(
                  'text-[10px] leading-none',
                  active ? 'font-bold' : 'font-semibold'
                )}
              >
                {item.shortLabel ?? item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export const CityMobileNav = memo(CityMobileNavInner)
