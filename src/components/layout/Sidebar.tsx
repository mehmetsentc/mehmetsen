'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Search,
  LogOut,
  Settings,
  Shield,
  User,
  PanelLeftClose,
  Home,
  Zap,
  Bell,
  Bookmark,
  Heart,
  HelpCircle,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useAuth } from '@/hooks/useAuth'
import { useMyPublishers } from '@/hooks/useMyPublishers'
import { isAdminUser } from '@/lib/admin'
import { isHomePathname, pathIs, ROUTES } from '@/constants/routes'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { SidebarInstallCTA } from '@/components/pwa/SidebarInstallCTA'
import { SidebarThemeToggle } from '@/components/layout/SidebarThemeToggle'
import {
  SIDEBAR_CATEGORIES,
  SIDEBAR_TOOLS,
  type SidebarNavItem,
} from '@/constants/sidebarNav'
import { clearFeedRestoreForFeedV2Nav } from '@/lib/feed/feedRestoration'
import { rememberFeedV2EntryOrigin } from '@/lib/feed/reader/feedV2Exit'
import {
  isPublisherProfilePath,
  resolvePublisherProfileHref,
} from '@/lib/nav/publisherProfileNav'
import { isPwaStandaloneDisplay } from '@/lib/platform'
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
  if (id === 'feed' || id === 'ana-feed') {
    return isHomePathname(pathname)
  }
  if (id === 'feed-v2' || href === ROUTES.FEED_V2) {
    return pathname === ROUTES.FEED_V2 || pathname.startsWith(`${ROUTES.FEED_V2}/`)
  }
  if (href === ROUTES.SEARCH || id === 'search') {
    return pathIs(pathname, ROUTES.SEARCH, '/search')
  }
  if (href === ROUTES.NOTIFICATIONS || id === 'notifications') {
    return pathIs(pathname, ROUTES.NOTIFICATIONS, '/notifications')
  }
  if (id === 'profile') {
    return pathIs(pathname, '/profil', '/profile')
  }
  if (href === ROUTES.LOCAL) return pathname.startsWith(ROUTES.LOCAL)
  if (href === ROUTES.SKOR) return pathname.startsWith(ROUTES.SKOR)
  if (href === ROUTES.REELS) return pathname.startsWith(ROUTES.REELS)
  if (href === ROUTES.EVENTS) return pathIs(pathname, ROUTES.EVENTS, '/events')
  if (href === ROUTES.WEATHER) return pathIs(pathname, ROUTES.WEATHER, '/weather')
  if (href === ROUTES.INFLUENCER) return pathIs(pathname, ROUTES.INFLUENCER, '/influencer')
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
      className={cn('app-sidebar__item', item.child && 'app-sidebar__item--child', active && 'is-active')}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="app-sidebar__icon" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function NavBranch({
  item,
  pathname,
  onNavigate,
}: {
  item: SidebarNavItem
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <>
      <NavLink item={item} pathname={pathname} onNavigate={onNavigate} />
      {item.children?.map((child) => (
        <NavLink key={child.id} item={child} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </>
  )
}

function SidebarInner({
  className,
  mobileOpen,
  desktopOpen = false,
  onMobileClose,
  onDesktopClose,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, loading } = useAuth()
  const { publishers, loading: publishersLoading, isPublisher } = useMyPublishers()
  const [hydrated, setHydrated] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const publisherHref =
    hydrated && !loading && !publishersLoading && user && isPublisher
      ? resolvePublisherProfileHref(publishers)
      : null
  const profileActive = isPublisherProfilePath(pathname, publishers)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    toast.success('Çıkış yapıldı')
    router.push(ROUTES.LOGIN)
    onMobileClose?.()
    onDesktopClose?.()
  }, [logout, router, onMobileClose, onDesktopClose])

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (searchQuery.trim()) {
        router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(searchQuery.trim())}`)
        onMobileClose?.()
        onDesktopClose?.()
      }
    },
    [searchQuery, router, onMobileClose, onDesktopClose]
  )

  const closeDrawer = useCallback(() => {
    onMobileClose?.()
    onDesktopClose?.()
  }, [onMobileClose, onDesktopClose])

  return (
    <>
      {/* Overlay drawer backdrop — mobile + desktop (tema bozulmasın, push yok) */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-[199] bg-black/55 transition-opacity duration-200 lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      ) : null}
      {desktopOpen ? (
        <div
          className="fixed inset-0 z-[199] hidden bg-black/55 transition-opacity duration-200 lg:block"
          onClick={onDesktopClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          'app-sidebar fixed left-0 z-[200] flex flex-col',
          /* Mobil + masaüstü: üst kenar viewport/header ile aynı hizada (overlay) */
          'top-0 bottom-0 h-full',
          'lg:bottom-0 lg:h-auto',
          'w-[var(--sidebar-width-collapsed)]',
          /* Temaya uyumlu yüzey — koyu modda beyaz panel yok */
          'border-r border-[rgb(var(--color-border))] bg-[rgb(var(--bg-elevated))]',
          'shadow-[4px_0_24px_rgba(0,0,0,0.18)]',
          'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          desktopOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full',
          className
        )}
        data-open={mobileOpen || desktopOpen ? 'true' : 'false'}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[rgb(var(--color-border))] px-4">
          <Link
            href={ROUTES.FEED}
            onClick={closeDrawer}
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
          {hydrated && !loading && user ? (
            <div className="app-sidebar__section px-3 pb-2" data-testid="account-drawer-identity">
              <Link
                href={ROUTES.PROFILE(user.username || user.uid)}
                onClick={closeDrawer}
                className="flex items-center gap-3 rounded-2xl px-1 py-2"
              >
                <Avatar name={user.displayName || user.username} src={user.photoURL} size="md" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold">{user.displayName || user.username}</span>
                  <span className="block truncate text-xs text-[rgb(var(--color-muted))]">@{user.username}</span>
                </span>
              </Link>
              <Link href={ROUTES.FEED} onClick={closeDrawer} className="app-sidebar__item">
                <Heart className="app-sidebar__icon" />
                Sana Özel
              </Link>
              <Link
                href={`${ROUTES.FEED_V2}?mode=following`}
                onClick={() => {
                  rememberFeedV2EntryOrigin(pathname)
                  clearFeedRestoreForFeedV2Nav({ pathname })
                  closeDrawer()
                }}
                className="app-sidebar__item"
              >
                <User className="app-sidebar__icon" />
                Takip Ettiklerim
              </Link>
              <Link href={ROUTES.SAVED} onClick={closeDrawer} className="app-sidebar__item">
                <Bookmark className="app-sidebar__icon" />
                Kaydettiklerim
              </Link>
            </div>
          ) : null}
          <div className="app-sidebar__section" data-testid="global-nav-v2-primary">
            <p className="app-sidebar__label">Gezinme</p>
            <Link
              href={ROUTES.FEED}
              onClick={closeDrawer}
              className={cn(
                'app-sidebar__item',
                isItemActive(pathname, ROUTES.FEED, 'ana-feed') && 'is-active'
              )}
              aria-label="Ana Sayfa"
              aria-current={isItemActive(pathname, ROUTES.FEED, 'ana-feed') ? 'page' : undefined}
              data-testid="global-nav-ana-feed"
            >
              <Home className="app-sidebar__icon" aria-hidden />
              <span>Ana Sayfa</span>
            </Link>
            <Link
              href={ROUTES.FEED_V2}
              onClick={() => {
                rememberFeedV2EntryOrigin(pathname)
                clearFeedRestoreForFeedV2Nav({ pathname })
                closeDrawer()
              }}
              className={cn(
                'app-sidebar__item',
                isItemActive(pathname, ROUTES.FEED_V2, 'feed-v2') && 'is-active'
              )}
              aria-label="Akış"
              aria-current={
                isItemActive(pathname, ROUTES.FEED_V2, 'feed-v2') ? 'page' : undefined
              }
              data-testid="global-nav-feed-v2"
            >
              <Zap className="app-sidebar__icon" aria-hidden />
              <span>Akış</span>
            </Link>
            <Link
              href={ROUTES.SEARCH}
              onClick={closeDrawer}
              className={cn(
                'app-sidebar__item',
                isItemActive(pathname, ROUTES.SEARCH, 'search') && 'is-active'
              )}
              aria-label="Ara"
              aria-current={isItemActive(pathname, ROUTES.SEARCH, 'search') ? 'page' : undefined}
              data-testid="global-nav-search"
            >
              <Search className="app-sidebar__icon" aria-hidden />
              <span>Ara</span>
            </Link>
            <Link
              href={ROUTES.NOTIFICATIONS}
              onClick={closeDrawer}
              className={cn(
                'app-sidebar__item',
                isItemActive(pathname, ROUTES.NOTIFICATIONS, 'notifications') && 'is-active'
              )}
              aria-label="Bildirimler"
              aria-current={
                isItemActive(pathname, ROUTES.NOTIFICATIONS, 'notifications')
                  ? 'page'
                  : undefined
              }
              data-testid="global-nav-notifications"
            >
              <Bell className="app-sidebar__icon" aria-hidden />
              <span>Bildirimler</span>
            </Link>
            {publisherHref ? (
              <Link
                href={publisherHref}
                onClick={closeDrawer}
                className={cn('app-sidebar__item', profileActive && 'is-active')}
                aria-label="Profil"
                aria-current={profileActive ? 'page' : undefined}
                data-testid="global-nav-profile"
              >
                <User className="app-sidebar__icon" aria-hidden />
                <span>Profil</span>
              </Link>
            ) : null}
          </div>

          <div className="app-sidebar__section">
            <p className="app-sidebar__label">Kategoriler</p>
            {SIDEBAR_CATEGORIES.map((item) => (
              <NavBranch
                key={item.id}
                item={item}
                pathname={pathname}
                onNavigate={closeDrawer}
              />
            ))}
          </div>

          <div className="app-sidebar__section">
            <p className="app-sidebar__label">Araçlar</p>
            {SIDEBAR_TOOLS.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                pathname={pathname}
                onNavigate={closeDrawer}
              />
            ))}
          </div>
        </nav>

        <div className="shrink-0 space-y-1 border-t border-[rgb(var(--color-border))] p-3">
          {hydrated ? <SidebarInstallCTA onNavigate={closeDrawer} /> : null}
          {hydrated ? <SidebarThemeToggle /> : null}
          {hydrated && !loading && user ? (
            <>
              <Link
                href={ROUTES.PROFILE(user.username || user.uid)}
                onClick={closeDrawer}
                className="app-sidebar__item"
                data-accent="muted"
                data-testid="sidebar-account-profile"
              >
                <User className="app-sidebar__icon" />
                Profilim
              </Link>
              {publisherHref ? (
                <Link
                  href={publisherHref}
                  onClick={closeDrawer}
                  className="app-sidebar__item"
                  data-accent="muted"
                  data-testid="sidebar-publisher-profile"
                >
                  <User className="app-sidebar__icon" />
                  Yayıncı profilim
                </Link>
              ) : null}
              <Link
                href={ROUTES.NOTIFICATIONS}
                onClick={closeDrawer}
                className="app-sidebar__item"
                data-accent="muted"
              >
                <Bell className="app-sidebar__icon" />
                Bildirimler
              </Link>
              <Link
                href={ROUTES.SETTINGS}
                onClick={closeDrawer}
                className="app-sidebar__item"
                data-accent="muted"
              >
                <Settings className="app-sidebar__icon" />
                Ayarlar
              </Link>
              <Link
                href={ROUTES.SETTINGS_HELP}
                onClick={closeDrawer}
                className="app-sidebar__item"
                data-accent="muted"
              >
                <HelpCircle className="app-sidebar__icon" />
                Yardım
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
                  Yönetim
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
              onClick={closeDrawer}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Giriş Yap →
            </Link>
          ) : null}
          {hydrated ? (
            <p
              className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-white/40"
              data-testid="pwa-install-status"
            >
              {isPwaStandaloneDisplay()
                ? 'NaHaber yüklü · Uygulaman aktif'
                : 'Tarayıcıda açık'}
            </p>
          ) : null}
        </div>
      </aside>
    </>
  )
}

export const Sidebar = memo(SidebarInner)
