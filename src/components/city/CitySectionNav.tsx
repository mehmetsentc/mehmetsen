'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buildCityHeaderNavItems } from '@/lib/citySidebarNav'
import { isCityFeedPath, isCitySectionActive } from '@/lib/cityPaths'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { cn } from '@/lib/utils'

function isCategoryPillActive(pathname: string, href: string): boolean {
  if (typeof window === 'undefined') return false
  if (!href.startsWith('/#')) return false
  if (!isCityFeedPath(pathname)) return false
  return window.location.hash === href.slice(1)
}

export function CitySectionNav() {
  const pathname = usePathname()
  const { categories, hasSpor } = useCityCategoryFilter()
  const items = buildCityHeaderNavItems(categories, { hasSpor })

  return (
    <nav
      className="z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]"
      aria-label="Şehir bölümleri"
    >
      <div className="newspaper-layout-inner flex gap-1 overflow-x-auto py-2 scrollbar-hide">
        {items.map((item) => {
          const Icon = item.icon
          const isHash = item.href.startsWith('/#')
          const active = isHash
            ? isCategoryPillActive(pathname, item.href)
            : isCitySectionActive(pathname, item.href)

          const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (!isHash) return
            const targetId = item.href.slice(2)
            if (isCityFeedPath(pathname)) {
              e.preventDefault()
              document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              window.history.replaceState(null, '', item.href)
            }
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={!isHash}
              onClick={handleClick}
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
