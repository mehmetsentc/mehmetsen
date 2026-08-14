'use client'

import { useEffect, useRef, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/store/themeContext'
import type { ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

const OPTIONS: Array<{
  id: Extract<ThemePreference, 'system' | 'light' | 'dark'>
  label: string
  icon: typeof Sun
}> = [
  { id: 'system', label: 'Sistem', icon: Monitor },
  { id: 'light', label: 'Açık', icon: Sun },
  { id: 'dark', label: 'Koyu', icon: Moon },
]

/** Admin header theme control: Sistem | Açık | Koyu (default preference: system). */
export function AdminThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const activeId: (typeof OPTIONS)[number]['id'] =
    theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'dark'

  const ActiveIcon = OPTIONS.find((o) => o.id === activeId)?.icon ?? Monitor

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-2.5 text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]"
        aria-label="Tema seç"
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Tema"
      >
        <ActiveIcon className="h-4 w-4" />
        <span className="hidden text-xs font-semibold sm:inline">
          {OPTIONS.find((o) => o.id === activeId)?.label}
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Tema"
          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-1 shadow-2xl"
        >
          {OPTIONS.map(({ id, label, icon: Icon }) => {
            const selected = activeId === id
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setTheme(id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  selected
                    ? 'bg-[rgb(var(--color-brand))]/10 font-semibold text-[rgb(var(--color-text))]'
                    : 'text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {selected ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--color-brand))]" />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
