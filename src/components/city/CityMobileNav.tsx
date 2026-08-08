'use client'

import { memo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Trophy, MapPin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  icon: LucideIcon
  label: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { icon: Home, label: 'Ana Feed', href: '/' },
  { icon: Calendar, label: 'Etkinlik', href: '/etkinlik' },
  { icon: Trophy, label: 'Spor', href: '/spor' },
  { icon: MapPin, label: 'İlçeler', href: '/ilceler' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
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
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
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
              <item.icon
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
