'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Search,
  LogOut,
  Settings,
  Shield,
  User,
  PanelLeftClose,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isAdminUser } from '@/lib/admin'
import { ROUTES } from '@/constants/routes'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { SidebarInstallCTA } from '@/components/pwa/SidebarInstallCTA'
import {
  SIDEBAR_EXPLORE,
  SIDEBAR_EXPLORE_PREVIEW,
  SIDEBAR_PRIMARY,
  SIDEBAR_TOOLS,
  type SidebarNavItem,
} from '@/constants/sidebarNav'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface SidebarProps {
  className?: string
  mobileOpen?: boolean
  desktopOpen?: boolean
  onMobileClose?: () => void
  onDesktopClose?: () => void
}

function isItemActive(pathname: string, href: string, id: string): boolean {
  if (id === 'feed') return pathname === ROUTES.FEED || pathname === ROUTES.HOME
  if (href === ROUTES.LOCAL) return pathname.startsWith(ROUTES.LOCAL)
  if (href === ROUTES.SKOR) return pathname.startsWith(ROUTES.SKOR)
  if (href === ROUTES.REELS) return pathname.startsWith(ROUTES.REELS)
  if (href === ROUTES.EVENTS) return pathname.startsWith(ROUTES.EVENTS)
  if (href === ROUTES.WEATHER) return pathname.startsWith(ROUTES.WEATHER)
  if (href === ROUTES.INFLUENCER) return pathname.startsWith(ROUTES.INFLUENCER)
  if (href === ROUTES.MUZELER) return pathname.startsWith(ROUTES.MUZELER)
  if (href === ROUTES.FOOTBALL) return pathname.startsWith(ROUTES.FOOTBALL)
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: SidebarNavItem
  pathname: string
  onNavigate?: () => void
}) {
  const active = isItemActive(pathname, item.href, item.id)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-accent={item.accent}
      className={cn('app-sidebar__item', active && 'is-active')}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="app-sidebar__icon" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function SidebarInner({
  className,
  mobileOpen,
  desktopOpen = true,
  onMobileClose,
  onDesktopClose,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, loading } = useAuth()
  const [hydrated, setHydrated] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [exploreOpen, setExploreOpen] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Keşfet’te aktif sayfa varsa bölümü otomatik aç
  useEffect(() => {
    const inExplore = SIDEBAR_EXPLORE.some((item) => isItemActive(pathname, item.href, item.id))
    if (inExplore) setExploreOpen(true)
  }, [pathname])

  const explorePreview = useMemo(
    () => SIDEBAR_EXPLORE.slice(0, SIDEBAR_EXPLORE_PREVIEW),
    []
  )
  const exploreRest = useMemo(
    () => SIDEBAR_EXPLORE.slice(SIDEBAR_EXPLORE_PREVIEW),
    []
  )

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
        router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(searchQuery.trim())}`)
        onMobileClose?.()
      }
    },
    [searchQuery, router, onMobileClose]
  )

  return (
    <>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-[199] bg-black/50 transition-opacity duration-200 lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'app-sidebar fixed inset-y-0 left-0 z-[200] flex flex-col',
          'w-[var(--sidebar-width-collapsed)]',
          'border-r border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]',
          'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          desktopOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full',
          className
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[rgb(var(--color-border))] px-4">
          <Link
            href={ROUTES.FEED}
            onClick={onMobileClose}
            className="flex min-w-0 items-center gap-2"
          >
            <BrandLogo size="md" priority />
            <BrandWordmark variant="default" size="sm" className="truncate font-black text-lg" />
          </Link>
          <button
            type="button"
            onClick={onDesktopClose}
            aria-label="Kenar çubuğunu kapat"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--bg-subtle))] hover:text-[rgb(var(--color-text))] lg:flex"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSearch} className="shrink-0">
          <div className="app-sidebar__search">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Haber ara…"
              aria-label="Haber ara"
            />
            <button type="submit" aria-label="Ara">
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>

        <nav className="app-sidebar__nav flex-1 overflow-y-auto" aria-label="Ana menü">
          <div className="app-sidebar__section">
            <p className="app-sidebar__label">Ana haber</p>
            {SIDEBAR_PRIMARY.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                pathname={pathname}
                onNavigate={onMobileClose}
              />
            ))}
          </div>

          <div className="app-sidebar__section">
            <p className="app-sidebar__label">Keşfet</p>
            {explorePreview.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                pathname={pathname}
                onNavigate={onMobileClose}
              />
            ))}

            {exploreRest.length > 0 ? (
              <>
                <button
                  type="button"
                  className="app-sidebar__more"
                  aria-expanded={exploreOpen}
                  onClick={() => setExploreOpen((v) => !v)}
                >
                  <span>{exploreOpen ? 'Daha az' : 'Daha fazla'}</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform duration-200',
                      exploreOpen && 'rotate-180'
                    )}
                  />
                </button>
                <div
                  className={cn('app-sidebar__explore', exploreOpen && 'is-open')}
                >
                  <div className="app-sidebar__explore-inner">
                    {exploreRest.map((item) => (
                      <NavLink
                        key={item.id}
                        item={item}
                        pathname={pathname}
                        onNavigate={onMobileClose}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="app-sidebar__section">
            <p className="app-sidebar__label">Araçlar</p>
            {SIDEBAR_TOOLS.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                pathname={pathname}
                onNavigate={onMobileClose}
              />
            ))}
          </div>
        </nav>

        <div className="shrink-0 space-y-1 border-t border-[rgb(var(--color-border))] p-3">
          {hydrated ? <SidebarInstallCTA onNavigate={onMobileClose} /> : null}
          {hydrated && !loading && user ? (
            <>
              <Link
                href={ROUTES.PROFILE(user.username)}
                onClick={onMobileClose}
                className="app-sidebar__item"
                data-accent="muted"
              >
                <User className="app-sidebar__icon" />
                Profilim
              </Link>
              <Link
                href={ROUTES.SETTINGS}
                onClick={onMobileClose}
                className="app-sidebar__item"
                data-accent="muted"
              >
                <Settings className="app-sidebar__icon" />
                Ayarlar
              </Link>
              {isAdminUser(user) ? (
                <a
                  href={ROUTES.ADMIN.DASHBOARD}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-sidebar__item"
                  data-accent="brand"
                >
                  <Shield className="app-sidebar__icon" />
                  Admin Panel
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleLogout}
                className="app-sidebar__item w-full text-left hover:!text-red-600"
                data-accent="muted"
              >
                <LogOut className="app-sidebar__icon" />
                Çıkış Yap
              </button>
            </>
          ) : null}
          {hydrated && !loading && !user ? (
            <Link
              href={ROUTES.LOGIN}
              onClick={onMobileClose}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Giriş Yap →
            </Link>
          ) : null}
        </div>
      </aside>
    </>
  )
}

export const Sidebar = memo(SidebarInner)
