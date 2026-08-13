'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  Search,
  LogOut,
  Settings,
  Shield,
  User,
  PanelLeftClose,
  Plus,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isAdminUser } from '@/lib/admin'
import { ROUTES } from '@/constants/routes'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { SidebarInstallCTA } from '@/components/pwa/SidebarInstallCTA'
import { SidebarThemeToggle } from '@/components/layout/SidebarThemeToggle'
import { SubmitNewsModal } from '@/components/profile/SubmitNewsModal'
import { getCityHeaderLockupPath, getCityLogoPath } from '@/lib/cityBrand'
import { isCitySectionActive } from '@/lib/cityPaths'
import {
  buildCityCategoryNavItems,
  buildCitySectionNavItems,
  type CitySidebarNavItem,
} from '@/lib/citySidebarNav'
import { useCityCategoryFilter } from '@/store/cityCategoryContext'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface CitySidebarProps {
  cityName: string
  provinceSlug: string
  className?: string
  mobileOpen?: boolean
  desktopOpen?: boolean
  onMobileClose?: () => void
  onDesktopClose?: () => void
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: CitySidebarNavItem
  pathname: string
  onNavigate?: () => void
}) {
  const active = isCitySectionActive(pathname, item.href)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={() => onNavigate?.()}
      data-accent={item.accent}
      className={cn('app-sidebar__item', active && 'is-active')}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="app-sidebar__icon" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function CitySidebarInner({
  cityName,
  provinceSlug,
  className,
  mobileOpen,
  desktopOpen = false,
  onMobileClose,
  onDesktopClose,
}: CitySidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, loading } = useAuth()
  const { categories, hasSpor } = useCityCategoryFilter()
  const [hydrated, setHydrated] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [submitOpen, setSubmitOpen] = useState(false)

  const lockupSrc = getCityHeaderLockupPath(provinceSlug, 'default')
  const logoSrc = getCityLogoPath(provinceSlug)
  const sectionItems = buildCitySectionNavItems({ hasSpor })
  const categoryItems = buildCityCategoryNavItems(categories)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const closeDrawer = useCallback(() => {
    onMobileClose?.()
    onDesktopClose?.()
  }, [onMobileClose, onDesktopClose])

  const handleLogout = useCallback(async () => {
    await logout()
    toast.success('Çıkış yapıldı')
    router.push(ROUTES.LOGIN)
    closeDrawer()
  }, [logout, router, closeDrawer])

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (searchQuery.trim()) {
        router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(searchQuery.trim())}`)
        closeDrawer()
      }
    },
    [searchQuery, router, closeDrawer]
  )

  const openSubmitNews = useCallback(() => {
    setSubmitOpen(true)
    closeDrawer()
  }, [closeDrawer])

  return (
    <>
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
          'top-0 bottom-0 h-full lg:bottom-0 lg:h-auto',
          'w-[var(--sidebar-width-collapsed)]',
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
            href="/"
            onClick={closeDrawer}
            className="flex min-w-0 items-center gap-2"
            aria-label={`${cityName} NaHaber`}
          >
            {lockupSrc ? (
              <Image
                src={lockupSrc}
                alt={`${cityName} NaHaber`}
                width={360}
                height={32}
                className="h-8 w-auto max-w-full object-contain object-left"
              />
            ) : logoSrc ? (
              <>
                <Image
                  src={logoSrc}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-md object-contain"
                />
                <span className="flex h-8 min-w-0 items-center truncate text-lg font-black leading-none tracking-tight text-[rgb(var(--color-text))]">
                  {cityName}
                  <span className="ml-1.5 text-[#E50914]">NaHaber</span>
                </span>
              </>
            ) : (
              <>
                <BrandWordmark variant="default" size="sm" className="truncate font-black text-lg" />
                <span className="truncate text-sm font-bold text-[rgb(var(--color-text))]">
                  {cityName}
                </span>
              </>
            )}
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

        <nav className="app-sidebar__nav flex-1 overflow-y-auto" aria-label="Şehir menüsü">
          <div className="app-sidebar__section">
            <p className="app-sidebar__label">Bölümler</p>
            {sectionItems.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                pathname={pathname}
                onNavigate={closeDrawer}
              />
            ))}
          </div>

          {categoryItems.length > 0 ? (
            <div className="app-sidebar__section">
              <p className="app-sidebar__label">Kategoriler</p>
              {categoryItems.map((item) => (
                <NavLink
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  onNavigate={closeDrawer}
                />
              ))}
            </div>
          ) : null}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-[rgb(var(--color-border))] p-3">
          <button
            type="button"
            onClick={openSubmitNews}
            className="app-sidebar__item w-full text-left"
            data-accent="brand"
          >
            <Plus className="app-sidebar__icon" />
            Haber Ekle
          </button>

          {hydrated ? <SidebarInstallCTA onNavigate={closeDrawer} /> : null}
          {hydrated ? <SidebarThemeToggle /> : null}

          {hydrated && !loading && user ? (
            <>
              <Link
                href={ROUTES.PROFILE(user.username || user.uid)}
                onClick={closeDrawer}
                className="app-sidebar__item"
                data-accent="muted"
              >
                <User className="app-sidebar__icon" />
                Profilim
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
              onClick={closeDrawer}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Giriş Yap →
            </Link>
          ) : null}
        </div>
      </aside>

      {submitOpen ? <SubmitNewsModal onClose={() => setSubmitOpen(false)} /> : null}
    </>
  )
}

export const CitySidebar = memo(CitySidebarInner)
