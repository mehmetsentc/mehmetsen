'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/store/themeContext'

/** Kompakt light/dark toggle — mastheada ve header'a eklenebilir. */
export function DesktopThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))] ${className ?? ''}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
