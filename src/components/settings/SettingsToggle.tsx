'use client'

import { cn } from '@/lib/utils'

interface SettingsToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  className,
}: SettingsToggleProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-[rgb(var(--color-surface))]',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[rgb(var(--color-text))]">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-[rgb(var(--color-muted))]">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-blue-600' : 'bg-[rgb(var(--color-border))]'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}
