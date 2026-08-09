'use client'

import { memo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Trophy, MapPin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CITY_BOTTOM_NAV } from '@/constants/cityCategories'
import { isCitySectionActive } from '@/lib/cityPaths'
import { cn } from '@/lib/utils'

const ICONS: Record<(typeof CITY_BOTTOM_NAV)[number]['iconName'], LucideIcon> = {
  home: Home,
  calendar: Calendar,
  trophy: Trophy,
  'map-pin': MapPin,
}

function CityMobileNavInner() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[105] border-t border-[rgb(var(--color-nav-bar-border))] bg-[rgb(var(--color-nav-bar))]/95 backdrop-blur-xl lg:hidden"
      aria-label="Şehir menü"
    >
      <div
        className="flex items-end pb-[var(--safe-bottom)]"
        style={{ height: 'calc(3.5rem + var(--safe-bottom, 0px))' }}
      >
        {CITY_BOTTOM_NAV.map((item) => {
          const Icon = ICONS[item.iconName]
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
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export const CityMobileNav = memo(CityMobileNavInner)
