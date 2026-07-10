'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getSwipeableFeedDestinations, resolveSwipeCategoryKey } from '@/constants/config'
import { cn } from '@/lib/utils'

const NAV_CATEGORIES = getSwipeableFeedDestinations()

export function CategoryNav() {
  const pathname = usePathname()
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
      className="sticky top-14 z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] lg:hidden"
      aria-label="Kategoriler"
    >
      <div className="flex gap-0 overflow-x-auto scroll-px-4 scrollbar-none">
        {NAV_CATEGORIES.map((cat) => {
          const isActive = activeKey === cat.id
          return (
            <Link
              key={cat.href}
              href={cat.href}
              className={cn(
                'relative shrink-0 px-4 py-2.5 text-[13px] font-semibold transition-colors',
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
      <p className="border-t border-[rgb(var(--color-border))]/60 px-4 py-1 text-[10px] text-[rgb(var(--color-muted))]">
        Kategoriler arasında geçmek için ekranı sağa veya sola kaydırın
      </p>
    </nav>
  )
}
