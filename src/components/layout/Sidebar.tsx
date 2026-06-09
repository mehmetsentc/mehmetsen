'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home,
  Clapperboard,
  Search,
  Bell,
  Bookmark,
  User,
  Settings,
  LogOut,
  PlusSquare,
  MessageCircle,
  CalendarDays,
  Shield,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isAdminUser } from '@/lib/admin'
import { NavMessagesBadge } from '@/components/layout/NavMessagesBadge'
import { logNavClick } from '@/lib/navDiagnostics'
import { ROUTES } from '@/constants/routes'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const navItems: Array<{
  icon: LucideIcon
  label: string
  href: string
  showBadge?: boolean
}> = [
  { icon: Home, label: 'Ana Sayfa', href: ROUTES.FEED },
  { icon: CalendarDays, label: 'Etkinlikler', href: ROUTES.EVENTS },
  { icon: Clapperboard, label: 'Teve', href: ROUTES.REELS },
  { icon: Search, label: 'Keşfet', href: ROUTES.DISCOVER },
  { icon: MessageCircle, label: 'Mesajlar', href: ROUTES.MESSAGES, showBadge: true },
  { icon: Bell, label: 'Bildirimler', href: ROUTES.NOTIFICATIONS },
  { icon: PlusSquare, label: 'Oluştur', href: ROUTES.POST_CREATE },
  { icon: Bookmark, label: 'Kaydedilenler', href: ROUTES.SAVED },
]

interface SidebarProps {
  className?: string
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.FEED) return pathname === ROUTES.FEED
  if (href === ROUTES.SETTINGS) return pathname.startsWith('/settings')
  if (href === ROUTES.MESSAGES) return pathname.startsWith('/messages')
  if (href.startsWith('/profile')) return pathname.startsWith('/profile')
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface SidebarLinkProps {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  pathname: string
  showBadge?: boolean
}

const SidebarLink = memo(function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  pathname,
  showBadge,
}: SidebarLinkProps) {
  const handleClick = useCallback(() => {
    logNavClick(href, pathname)
  }, [href, pathname])

  return (
    <Link
      href={href}
      prefetch
      title={label}
      onClick={handleClick}
      className={cn('sidebar-link nav-tap-target', active && 'sidebar-link-active')}
    >
      <span className="relative">
        <Icon className={cn('sidebar-icon', active && 'sidebar-icon-active')} strokeWidth={active ? 2.5 : 2} />
        {showBadge && <NavMessagesBadge size="md" />}
      </span>
      <span className="sidebar-label">{label}</span>
    </Link>
  )
})

function SidebarInner({ className, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    toast.success('Çıkış yapıldı')
    router.push(ROUTES.LOGIN)
  }, [logout, router])

  const profileHref = hydrated && user ? ROUTES.PROFILE(user.username) : ROUTES.LOGIN

  return (
    <>
      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[199] bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
    <aside className={cn(
        'sidebar-rail app-nav-sidebar group/sidebar',
        // Always fixed-position; translate-x controls visibility
        'fixed inset-y-0 left-0 z-[200] transition-transform duration-300',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        className,
      )}>
      <Link
        href={ROUTES.FEED}
        prefetch
        className="sidebar-brand nav-tap-target"
        aria-label="NaHaber"
        onClick={() => logNavClick(ROUTES.FEED, pathname)}
      >
        <BrandLogo size="md" className="sidebar-brand-logo" priority />
        <span className="sidebar-brand-text">NaHaber</span>
      </Link>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(pathname, item.href)}
            pathname={pathname}
            showBadge={item.showBadge}
          />
        ))}

        {hydrated && user && isAdminUser(user) && (
          <SidebarLink
            href={ROUTES.ADMIN.DASHBOARD}
            label="Admin Panel"
            icon={Shield}
            active={pathname.startsWith('/admin')}
            pathname={pathname}
          />
        )}

        {hydrated && user && (
          <SidebarLink
            href={profileHref}
            label="Profil"
            icon={User}
            active={pathname.startsWith('/profile')}
            pathname={pathname}
          />
        )}
      </nav>

      <div className="sidebar-footer">
        <SidebarLink
          href={ROUTES.SETTINGS}
          label="Ayarlar"
          icon={Settings}
          active={pathname.startsWith('/settings')}
          pathname={pathname}
        />

        {hydrated && user && (
          <button
            type="button"
            onClick={handleLogout}
            title="Çıkış yap"
            className="sidebar-link sidebar-link-danger nav-tap-target w-full"
          >
            <LogOut className="sidebar-icon" />
            <span className="sidebar-label">Çıkış Yap</span>
          </button>
        )}
      </div>
    </aside>
    </>
  )
}

export const Sidebar = memo(SidebarInner)
