'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/store/themeContext'
import { cn } from '@/lib/utils'

/** Sidebar drawer row — light/dark toggle, same persistence as desktop. */
export function SidebarThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'

  const toggle = () => setTheme(isDark ? 'light' : 'dark')

  return (
    <button
      type="button"
      onClick={toggle}
      className="app-sidebar__item w-full text-left"
      data-accent="muted"
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
    >
      {isDark ? (
        <Moon className="app-sidebar__icon" aria-hidden />
      ) : (
        <Sun className="app-sidebar__icon" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">{isDark ? 'Koyu tema' : 'Açık tema'}</span>
      <span
        role="switch"
        aria-checked={isDark}
        aria-hidden
        className={cn(
          'relative ml-auto h-5 w-9 shrink-0 rounded-full transition-colors',
          isDark ? 'bg-[rgb(var(--color-brand))]' : 'bg-[rgb(var(--color-border))]'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            isDark ? 'translate-x-[18px]' : 'translate-x-0.5'
          )}
        />
      </span>
    </button>
  )
}
