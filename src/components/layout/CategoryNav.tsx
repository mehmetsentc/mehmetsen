'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { resolveSwipeCategoryKey } from '@/constants/config'
import { ContextRail, contextRailChipClass } from '@/components/layout/ContextRail'
import {
  getSharedRailDestinations,
  sharedRailChipLabel,
} from '@/lib/feed/sharedCategoryRail'
import { cn } from '@/lib/utils'

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
  /**
   * When true, sits inside Navbar's sticky chrome (no own sticky/top).
   * Prevents dual-sticky desync / overscroll gaps on iOS.
   */
  embedded?: boolean
  /** Transparent rail over a full-bleed feed card. */
  overlay?: boolean
}

export function CategoryNav({
  categories,
  onCategorySelect,
  activeCategoryId,
  embedded = false,
  overlay = false,
}: CategoryNavProps = {}) {
  const pathname = usePathname()

  const shellClass = cn(
    categories ? null : 'lg:hidden',
    embedded ? 'relative z-auto' : 'sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]'
  )

  if (!categories) {
    const activeKey = resolveSwipeCategoryKey(pathname)

    const hide =
      pathname === '/reels' ||
      pathname === '/video' ||
      pathname === '/feed-v2' ||
      pathname.startsWith('/feed-v2/') ||
      pathname.startsWith('/messages') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/haber/') ||
      pathname.startsWith('/post/') ||
      pathname.startsWith('/profile/')

    if (hide) return null

    return (
      <div className={shellClass}>
        <ContextRail ariaLabel="Kategoriler" testId="context-rail-home">
          {getSharedRailDestinations().map((cat) => {
            const isActive = activeKey === cat.id
            return (
              <Link
                key={cat.href}
                href={cat.href}
                prefetch
                className={contextRailChipClass(isActive)}
                aria-current={isActive ? 'page' : undefined}
              >
                {sharedRailChipLabel(cat)}
              </Link>
            )
          })}
        </ContextRail>
      </div>
    )
  }

  return (
    <div className={shellClass}>
      <ContextRail ariaLabel="Kategoriler" testId="context-rail-city">
        {categories.map((cat) => {
          const isActive =
            activeCategoryId === cat.id || (activeCategoryId === null && cat.id === '__all')
          const categoryId = cat.id === '__all' ? null : cat.id
          return (
            <Link
              key={cat.id}
              href={cat.href}
              prefetch={false}
              scroll={false}
              data-category-chip={cat.id}
              onClick={(event) => {
                if (!onCategorySelect) return
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                onCategorySelect(categoryId)
                const next = categoryId ? `/?category=${encodeURIComponent(categoryId)}` : '/'
                window.history.replaceState(window.history.state, '', next)
              }}
              className={
                overlay
                  ? cn('feed-v2-cat-chip', contextRailChipClass(isActive))
                  : contextRailChipClass(isActive)
              }
              aria-current={isActive ? 'page' : undefined}
            >
              {cat.label}
            </Link>
          )
        })}
      </ContextRail>
    </div>
  )
}
