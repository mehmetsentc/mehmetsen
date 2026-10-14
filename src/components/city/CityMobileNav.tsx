'use client'

import { memo, useEffect, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buildCitySectionNavItems } from '@/lib/citySidebarNav'
import { isCitySectionActive } from '@/lib/cityPaths'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { useCityTenant } from '@/store/cityTenantContext'
import { cn } from '@/lib/utils'
import { CITY_HAS_SPOR_KEY } from '@/components/city/CityRouteLoading'

function CityMobileNavInner() {
  const pathname = usePathname()
  const { hasSpor } = useCityCategoryFilter()
  const tenant = useCityTenant()
  const items = buildCitySectionNavItems({
    hasSpor,
    citySlug: tenant?.provinceSlug,
  })
  // Tapped tab turns active at once; repeat taps while it loads are ignored.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  useEffect(() => {
    setPendingHref(null)
  }, [pathname])
  // The route shell (CityRouteLoading) draws the same bar — remember whether Spor shows.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(CITY_HAS_SPOR_KEY, hasSpor ? '1' : '0')
    } catch {
      // private mode: the shell just guesses
    }
  }, [hasSpor])

  return (
    <nav
      className="city-mobile-bottom-nav mobile-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-[var(--mobile-nav-inset-x)] lg:hidden"
      aria-label="Şehir menü"
      data-testid="city-mobile-bottom-nav"
    >
      <div className="city-mobile-bottom-nav-pill pointer-events-auto">
        {items.map((item) => {
          const Icon = item.icon
          const active = pendingHref ? pendingHref === item.href : isCitySectionActive(pathname, item.href)
          const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
            if (pendingHref === item.href) {
              e.preventDefault()
              return
            }
            if (!isCitySectionActive(pathname, item.href)) setPendingHref(item.href)
          }
          const caption = item.shortLabel || item.label
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClick}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              data-testid={`city-nav-${item.id}`}
              className="flex min-w-0 flex-1 flex-col items-center justify-center touch-manipulation px-0.5"
            >
              <span
                className={cn(
                  'city-mobile-bottom-nav-icon flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150',
                  active
                    ? 'city-mobile-bottom-nav-icon--active bg-white/20 text-white'
                    : 'bg-transparent text-white/80'
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  'mt-0.5 max-w-full truncate text-[10px] font-semibold leading-none',
                  active ? 'text-white' : 'text-white/55'
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
