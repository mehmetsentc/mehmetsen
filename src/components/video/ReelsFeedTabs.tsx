'use client'

import { cn } from '@/lib/utils'

export type ReelsFeedTab = 'for-you' | 'following'

interface ReelsFeedTabsProps {
  active: ReelsFeedTab
  onChange: (tab: ReelsFeedTab) => void
}

export function ReelsFeedTabs({ active, onChange }: ReelsFeedTabsProps) {
  const tabs: { id: ReelsFeedTab; label: string }[] = [
    { id: 'for-you', label: 'Senin için' },
    { id: 'following', label: 'Takip' },
  ]

  return (
    <div className="flex items-center gap-6 sm:gap-8">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'border-b-2 pb-2 text-sm font-semibold transition-colors sm:text-base',
            active === id
              ? 'border-blue-500 text-[rgb(var(--color-text))]'
              : 'border-transparent text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
