'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Newspaper, Menu, Plus, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobileAdmin } from './MobileAdminContext'
import { isTabActive } from '@/lib/mobileAdminRules'

/**
 * MOBILE-ADMIN-1 — one layout, five fixed entries on every screen (hidden only in the
 * editor): Bugün · Haberler (approvals + content in one list) · + · Paylaşım · Menü.
 */
const TABS = [
  { id: 'home', href: '/admin', label: 'Bugün', icon: Home, exact: true, also: [] as string[] },
  { id: 'news', href: '/admin/news', label: 'Haberler', icon: Newspaper, also: ['/admin/approvals'] },
  { id: 'create', href: '#create', label: 'Haber', icon: Plus, center: true, also: [] as string[] },
  { id: 'shares', href: '/admin/social/shares', label: 'Paylaşım', icon: Share2, also: [] as string[] },
  { id: 'menu', href: '/admin/menu', label: 'Menü', icon: Menu, also: [] as string[] },
] as const

export function MobileAdminBottomNav() {
  const pathname = usePathname()
  const { openCreate, pendingBadge, hideChrome } = useMobileAdmin()

  if (hideChrome) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Mobil haber odası"
    >
      <div className="mx-auto flex h-14 max-w-lg items-end justify-between px-1">
        {TABS.map((tab) => {
          if ('center' in tab && tab.center) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={openCreate}
                className="-mt-5 flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center"
                aria-label="Yeni haber"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-white shadow-lg shadow-[rgb(var(--color-brand))]/30">
                  <Plus className="h-7 w-7" strokeWidth={2.5} />
                </span>
              </button>
            )
          }

          const active = isTabActive(pathname, tab)
          const Icon = tab.icon
          const showBadge = tab.id === 'news' && pendingBadge > 0

          return (
            <Link
              key={tab.id}
              href={showBadge ? '/admin/news?filter=pending' : tab.href}
              className={cn(
                'relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 pb-1 pt-1.5 text-[10px] font-semibold',
                active ? 'text-[rgb(var(--color-brand))]' : 'text-[rgb(var(--color-muted))]'
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              <span>{tab.label}</span>
              {showBadge ? (
                <span className="absolute right-[18%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] px-1 text-[9px] font-bold text-white">
                  {pendingBadge > 99 ? '99+' : pendingBadge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
