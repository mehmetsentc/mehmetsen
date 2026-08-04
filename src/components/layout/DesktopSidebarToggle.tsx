'use client'

import { PanelLeft } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useUiStore } from '@/store/uiStore'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { ROUTES } from '@/constants/routes'

/** Gazete header’ı olmayan slim sayfalarda yüzen menü düğmesi. */
function needsFloatingToggle(pathname: string): boolean {
  if (pathname === ROUTES.REELS) return false
  if (pathname.startsWith('/messages')) return false
  if (pathname.startsWith('/admin')) return false
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) return false
  return (
    pathname.startsWith('/search') ||
    pathname.startsWith('/ara') ||
    pathname.startsWith('/saved') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/oyunlar')
  )
}

export function DesktopSidebarToggle() {
  const pathname = usePathname()
  const isDesktop = usePlatformLayout().isDesktop
  const desktopSidebarOpen = useUiStore((s) => s.desktopSidebarOpen)
  const toggleDesktopSidebar = useUiStore((s) => s.toggleDesktopSidebar)

  if (!isDesktop || desktopSidebarOpen || !needsFloatingToggle(pathname)) return null

  return (
    <button
      type="button"
      onClick={toggleDesktopSidebar}
      aria-label="Kenar çubuğunu aç"
      className="back-nav-sidebar-toggle fixed left-3 top-3 z-[150] hidden h-10 w-10 items-center justify-center rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))] shadow-sm transition-colors hover:bg-[rgb(var(--bg-subtle))] lg:flex"
    >
      <PanelLeft className="h-5 w-5" />
    </button>
  )
}
