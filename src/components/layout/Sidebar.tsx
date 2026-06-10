'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, LogOut, CalendarDays, Clapperboard, Settings, Shield, Star, Cloud, MapPin, Flame } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isAdminUser } from '@/lib/admin'
import { ROUTES } from '@/constants/routes'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { DEFAULT_CATEGORIES, SIDEBAR_MAIN_CATEGORY_IDS } from '@/constants/config'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface SidebarProps {
  className?: string
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const APP_NAV = [
  { label: 'Etkinlikler', href: ROUTES.EVENTS,      icon: CalendarDays },
  { label: 'Magazin',     href: '/kategori/magazin', icon: Star         },
  { label: 'Trending',    href: '/kategori/trend',   icon: Flame        },
  { label: 'Teve',        href: ROUTES.REELS,        icon: Clapperboard },
  { label: 'Influencer',  href: ROUTES.INFLUENCER,   icon: Star         },
  { label: 'Yerel',       href: ROUTES.LOCAL,        icon: MapPin       },
  { label: 'Hava Durumu', href: ROUTES.WEATHER,      icon: Cloud        },
]

/** Main categories shown in top nav (user-defined order, Trending/Magazin excluded). */
const MAIN_CATEGORIES = SIDEBAR_MAIN_CATEGORY_IDS
  .map((id) => DEFAULT_CATEGORIES.find((c) => c.id === id))
  .filter(Boolean) as typeof DEFAULT_CATEGORIES[number][]

function SidebarInner({ className, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [hydrated, setHydrated] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => { setHydrated(true) }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    toast.success('Çıkış yapıldı')
    router.push(ROUTES.LOGIN)
    onMobileClose?.()
  }, [logout, router, onMobileClose])

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (searchQuery.trim()) {
        router.push(`${ROUTES.DISCOVER}?q=${encodeURIComponent(searchQuery.trim())}`)
        onMobileClose?.()
      }
    },
    [searchQuery, router, onMobileClose],
  )

  const isFeedOnly = pathname === ROUTES.FEED

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[199] bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[200] flex flex-col',
          'w-[var(--sidebar-width-collapsed)]',
          'border-r border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]',
          'transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          className,
        )}
      >
        {/* Logo header */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[rgb(var(--color-border))] px-4">
          <Link href={ROUTES.FEED} onClick={onMobileClose} className="flex items-center gap-2">
            <BrandLogo size="md" priority />
            <span className="text-lg font-black tracking-tight text-[rgb(var(--color-text))]">
              NaHaber
            </span>
          </Link>
        </div>

        {/* Search */}
        <form
          onSubmit={handleSearch}
          className="shrink-0 border-b border-[rgb(var(--color-border))] px-3 py-3"
        >
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Haber Arayın"
              className="min-w-0 flex-1 rounded-xl bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] outline-none"
            />
            <button
              type="submit"
              aria-label="Ara"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--color-brand))] text-white hover:bg-red-700"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Category list */}
        <nav className="flex-1 overflow-y-auto">
          <Link
            href={ROUTES.FEED}
            onClick={onMobileClose}
            className={cn(
              'relative flex items-center px-5 py-3 text-[15px] transition-colors',
              isFeedOnly
                ? 'font-bold text-[rgb(var(--color-text))]'
                : 'font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
            )}
          >
            {isFeedOnly && (
              <span className="absolute left-0 top-0 h-full w-[3px] rounded-r-full bg-[rgb(var(--color-brand))]" />
            )}
            Tümü
          </Link>

          {MAIN_CATEGORIES.map((cat) => {
            const href = ROUTES.CATEGORY(cat.slug)
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={cat.id}
                href={href}
                onClick={onMobileClose}
                className={cn(
                  'relative flex items-center px-5 py-3 text-[15px] transition-colors',
                  isActive
                    ? 'font-bold text-[rgb(var(--color-text))]'
                    : 'font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-0 h-full w-[3px] rounded-r-full bg-[rgb(var(--color-brand))]" />
                )}
                {cat.name}
              </Link>
            )
          })}

          <div className="mx-4 my-2 border-t border-[rgb(var(--color-border))]" />

          {APP_NAV.map(({ label, href, icon: Icon }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={onMobileClose}
                className={cn(
                  'relative flex items-center gap-3 px-5 py-3 text-[15px] transition-colors',
                  isActive
                    ? 'font-bold text-[rgb(var(--color-text))]'
                    : 'font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-0 h-full w-[3px] rounded-r-full bg-[rgb(var(--color-brand))]" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            )
          })}

          {hydrated && user && isAdminUser(user) && (
            <Link
              href={ROUTES.ADMIN.DASHBOARD}
              onClick={onMobileClose}
              className={cn(
                'relative flex items-center gap-3 px-5 py-3 text-[15px] transition-colors',
                pathname.startsWith('/admin')
                  ? 'font-bold text-[rgb(var(--color-text))]'
                  : 'font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
              )}
            >
              {pathname.startsWith('/admin') && (
                <span className="absolute left-0 top-0 h-full w-[3px] rounded-r-full bg-[rgb(var(--color-brand))]" />
              )}
              <Shield className="h-4 w-4 shrink-0" />
              Admin Panel
            </Link>
          )}
        </nav>

        {/* Footer */}
        <div className="shrink-0 space-y-1 border-t border-[rgb(var(--color-border))] p-3">
          {hydrated && user && (
            <>
              <Link
                href={ROUTES.SETTINGS}
                onClick={onMobileClose}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]"
              >
                <Settings className="h-4 w-4 shrink-0" />
                Ayarlar
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[rgb(var(--color-muted))] hover:text-red-600"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Çıkış Yap
              </button>
            </>
          )}
          {hydrated && !user && (
            <Link
              href={ROUTES.LOGIN}
              onClick={onMobileClose}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Giriş Yap →
            </Link>
          )}
        </div>
      </aside>
    </>
  )
}

export const Sidebar = memo(SidebarInner)
