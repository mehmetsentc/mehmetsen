'use client'

import { useTheme } from '@/store/themeContext'
import { useUiStore } from '@/store/uiStore'

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ClosePanelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6 9 12l6 6M20 4v16H8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CityDesktopMenuButton() {
  const open = useUiStore((s) => s.desktopSidebarOpen)
  const toggle = useUiStore((s) => s.toggleDesktopSidebar)

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? 'Kenar çubuğunu kapat' : 'Kenar çubuğunu aç'}
      aria-expanded={open}
      data-testid="city-desktop-menu"
      className="flex h-8 w-8 shrink-0 items-center justify-center text-[rgb(var(--color-text-secondary))] transition-colors hover:text-[rgb(var(--color-text))]"
    >
      {open ? <ClosePanelIcon /> : <MenuIcon />}
    </button>
  )
}

export function CityDesktopThemeButton() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      data-testid="city-desktop-theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
