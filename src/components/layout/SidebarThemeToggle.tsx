'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/store/themeContext'
import { cn } from '@/lib/utils'
import type { ThemePreference } from '@/lib/theme'

const OPTIONS: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'Sistem', icon: Monitor },
  { id: 'light', label: 'Açık', icon: Sun },
  { id: 'dark', label: 'Koyu', icon: Moon },
]

/** Sidebar drawer — Sistem / Açık / Koyu, same localStorage as Settings. */
export function SidebarThemeToggle() {
  const { theme, setTheme } = useTheme()
  const selected = theme === 'oled' ? 'dark' : theme

  return (
    <div className="px-3 py-2" data-testid="sidebar-theme-toggle">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        Tema
      </p>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[rgb(var(--color-surface-raised))] p-1">
        {OPTIONS.map(({ id, label, icon: Icon }) => {
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={active}
              className={cn(
                'flex min-h-9 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-bold',
                active
                  ? 'bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))] shadow-sm'
                  : 'text-[rgb(var(--color-muted))]'
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
