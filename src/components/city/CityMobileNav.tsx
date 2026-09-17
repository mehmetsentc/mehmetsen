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
      className="city-mobile-bottom-nav mobile-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-[var(--mobile-nav-inset-x)] lg:hidden"
      aria-label="Şehir menü"
      data-testid="city-mobile-bottom-nav"
    >
      <div className="city-mobile-bottom-nav-pill pointer-events-auto">
        {items.map((item) => {
          const Icon = item.icon
          const active = isCitySectionActive(pathname, item.href)
          const caption = item.shortLabel || item.label
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              data-testid={`city-nav-${item.id}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-center touch-manipulation px-0.5"
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150',
                  active
                    ? 'bg-[rgb(var(--color-brand))] text-white'
                    : 'bg-[rgb(var(--color-surface-raised))] text-[rgb(var(--color-text))]'
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  'mt-0.5 max-w-full truncate text-[10px] font-semibold leading-none',
                  active
                    ? 'text-[rgb(var(--color-brand))]'
                    : 'text-[rgb(var(--color-text-secondary))]'
                )}
              >
                {caption}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export const CityMobileNav = memo(CityMobileNavInner)
