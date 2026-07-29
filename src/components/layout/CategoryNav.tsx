'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getSwipeableFeedDestinations, resolveSwipeCategoryKey } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const NAV_CATEGORIES = getSwipeableFeedDestinations()

/** Must match Navbar feed height (`h-[72px]` + safe-area). */
const FEED_NAV_TOP = 'top-[calc(72px+env(safe-area-inset-top,0px))]'
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
      <div
        className={cn(
          'flex overflow-x-auto scrollbar-hide',
          isFeed
            ? 'min-h-[54px] snap-x snap-mandatory scroll-px-4 gap-6 px-4'
            : 'gap-0 scroll-px-3'
        )}
        data-no-category-swipe
      >
        {NAV_CATEGORIES.map((cat) => {
          const isActive = activeKey === cat.id
          return (
            <Link
              key={cat.href}
              href={cat.href}
              className={cn(
                'relative flex shrink-0 items-center transition-colors',
                isFeed
                  ? 'min-h-[54px] snap-start px-0.5 text-[15px] font-semibold'
                  : 'min-h-11 px-3.5 text-sm font-semibold',
                isActive
                  ? 'text-[rgb(var(--color-brand))]'
                  : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {cat.label}
              {isActive && (
                <span
                  className={cn(
                    'absolute bottom-0 h-[2.5px] rounded-full bg-[rgb(var(--color-brand))]',
                    isFeed ? 'left-0 right-0' : 'left-3 right-3 h-[2px]'
                  )}
                />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
