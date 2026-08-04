'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/store/themeContext'
import { cn } from '@/lib/utils'

/** Kompakt light/dark toggle — mastheada ve header'a eklenebilir. */
export function DesktopThemeToggle({
  className,
  variant = 'default',
}: {
  className?: string
  variant?: 'default' | 'onBrand'
}) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const onBrand = variant === 'onBrand'

  return (
    <button
      type="button"
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
        onBrand
          ? 'text-white/90 hover:bg-white/15 hover:text-white'
          : 'text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]',
        className
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
