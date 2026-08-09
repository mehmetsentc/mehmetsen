'use client'

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

export function CitySectionNav() {
  const pathname = usePathname()

  return (
    <nav
      className="z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]"
      aria-label="Şehir bölümleri"
    >
      <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 py-2 scrollbar-hide">
        {CITY_BOTTOM_NAV.map((item) => {
          const Icon = ICONS[item.iconName]
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
