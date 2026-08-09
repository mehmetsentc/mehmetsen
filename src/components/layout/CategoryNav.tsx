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

export interface CategoryNavItem {
  id: string
  label: string
  href: string
}

interface CategoryNavProps {
  /** Override category list (used by city sites for dynamic categories). */
  categories?: CategoryNavItem[]
  /** Callback when a category is tapped (city sites use client-side filter). */
  onCategorySelect?: (categoryId: string | null) => void
  /** Currently active category id for controlled mode. */
  activeCategoryId?: string | null
}

export function CategoryNav({ categories, onCategorySelect, activeCategoryId }: CategoryNavProps = {}) {
  const pathname = usePathname()
  const isFeed = pathname === '/' || pathname === ROUTES.FEED

  // When operating in national mode (no categories override)
  if (!categories) {
    const activeKey = resolveSwipeCategoryKey(pathname)

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
          'sticky z-30 bg-[rgb(var(--header-navy-bg))] lg:hidden',
          isFeed ? FEED_NAV_TOP : DEFAULT_NAV_TOP
        )}
        aria-label="Kategoriler"
      >
        <div
          className={cn(
            'flex overflow-x-auto scrollbar-hide',
            isFeed
              ? 'min-h-[48px] snap-x snap-mandatory scroll-px-4 gap-5 px-4'
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
                    ? 'min-h-[48px] snap-start px-0.5 text-[15px] font-semibold'
                    : 'min-h-11 px-3.5 text-sm font-semibold',
                  isActive
                    ? 'text-white'
                    : 'text-white/75 hover:text-white'
                )}
              >
                {cat.label}
                {isActive && (
                  <span
                    className={cn(
                      'absolute bottom-0 h-[2.5px] rounded-full bg-white',
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

  // City mode: render dynamic categories with onCategorySelect callback
  return (
    <nav
      className={cn(
        'sticky z-30 bg-[rgb(var(--header-navy-bg))] lg:hidden',
        FEED_NAV_TOP
      )}
      aria-label="Kategoriler"
    >
      <div
        className="flex min-h-[48px] snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 scrollbar-hide"
        data-no-category-swipe
      >
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id || (activeCategoryId === null && cat.id === '__all')
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategorySelect?.(cat.id === '__all' ? null : cat.id)}
              className={cn(
                'relative flex min-h-[48px] shrink-0 snap-start items-center px-0.5 text-[15px] font-semibold transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-white/75 hover:text-white'
              )}
            >
              {cat.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full bg-white" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
