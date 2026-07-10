'use client'

import { PanelLeft } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'

export function DesktopSidebarToggle() {
  const isDesktop = usePlatformLayout().isDesktop
  const desktopSidebarOpen = useUiStore((s) => s.desktopSidebarOpen)
  const toggleDesktopSidebar = useUiStore((s) => s.toggleDesktopSidebar)

  if (!isDesktop || desktopSidebarOpen) return null

  return (
    <button
      type="button"
      onClick={toggleDesktopSidebar}
      aria-label="Kenar çubuğunu aç"
      className="fixed left-4 top-4 z-[150] hidden h-10 w-10 items-center justify-center rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))] shadow-sm transition-colors hover:bg-[rgb(var(--bg-subtle))] lg:flex"
    >
      <PanelLeft className="h-5 w-5" />
    </button>
  )
}
