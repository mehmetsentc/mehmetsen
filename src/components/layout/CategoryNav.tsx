'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getSwipeableFeedDestinations, resolveSwipeCategoryKey } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const NAV_CATEGORIES = getSwipeableFeedDestinations()

/** Must match Navbar feed height (`h-[72px]`). */
const FEED_NAV_TOP = 'top-[72px]'
const DEFAULT_NAV_TOP = 'top-14'

export function CategoryNav() {
  const pathname = usePathname()
  const activeKey = resolveSwipeCategoryKey(pathname)
  const isFeed = pathname === ROUTES.FEED

  const hide =
    pathname === '/reels' ||
    pathname.startsWith('/messages') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/haber/') ||
    pathname.startsWith('/post/') ||
    pathname.startsWith('/profile/')

  if (hide) return null

  return (
    <nav
      className={cn(
        'sticky z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] lg:hidden',
        isFeed ? FEED_NAV_TOP : DEFAULT_NAV_TOP
      )}
      aria-label="Kategoriler"
    >
      <div className="flex gap-0 overflow-x-auto scroll-px-3 scrollbar-none">
        {NAV_CATEGORIES.map((cat) => {
          const isActive = activeKey === cat.id
          return (
            <Link
              key={cat.href}
              href={cat.href}
              className={cn(
                'relative flex min-h-11 shrink-0 items-center px-3.5 text-sm font-semibold transition-colors',
                isActive
                  ? 'text-[rgb(var(--color-brand))]'
                  : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {cat.label}
              {isActive && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[rgb(var(--color-brand))]" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
