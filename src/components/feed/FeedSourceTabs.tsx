'use client'

import { cn } from '@/lib/utils'
import type { FeedSource } from '@/lib/feedSource'

interface FeedSourceTabsProps {
  value: FeedSource
  onChange: (value: FeedSource) => void
}

const TABS: Array<{ id: FeedSource; label: string; description: string }> = [
  { id: 'nahaber', label: 'NaHaber Haberleri', description: 'Editoryal ve resmi akış' },
  { id: 'user', label: 'Kullanıcı Haberleri', description: 'Topluluk paylaşımları' },
]

export function FeedSourceTabs({ value, onChange }: FeedSourceTabsProps) {
  return (
    <div className="feed-source-tabs" role="tablist" aria-label="Akış türü">
      {TABS.map((tab) => {
        const active = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn('feed-source-tab', active && 'feed-source-tab-active')}
          >
            <span className="feed-source-tab-label">{tab.label}</span>
            <span className="feed-source-tab-desc">{tab.description}</span>
          </button>
        )
      })}
    </div>
  )
}
