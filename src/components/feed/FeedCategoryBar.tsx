'use client'

import Link from 'next/link'
import { getTopNavCategories } from '@/constants/config'

export type FeedTab = 'home' | 'trend'

interface FeedCategoryBarProps {
  activeTab: FeedTab
  onTabChange: (tab: FeedTab) => void
}

// Sadece 2 sekme: Ana Sayfa | Trend
const IN_PAGE_TABS: { id: FeedTab; label: string }[] = [
  { id: 'home',  label: 'Ana Sayfa' },
  { id: 'trend', label: 'Trend' },
]

// Tek SSOT: constants/config.ts → getTopNavCategories
const NAV_CATEGORIES = getTopNavCategories()

export function FeedCategoryBar({ activeTab, onTabChange }: FeedCategoryBarProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 bg-[rgb(var(--color-surface))]/95 backdrop-blur-sm border-b border-[rgb(var(--color-border))]">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 scrollbar-hide">
        {/* In-page tab switches */}
        {IN_PAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={[
              'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-[rgb(var(--color-brand))] text-white shadow-sm'
                : 'text-[rgb(var(--color-text))] opacity-60 hover:opacity-100 hover:bg-[rgb(var(--color-nav-hover))]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}

        {/* Divider */}
        <span className="mx-1 h-4 w-px flex-shrink-0 bg-[rgb(var(--color-border))]" />

        {/* Category navigation links */}
        {NAV_CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            href={cat.href}
            className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-border))]"
          >
            {cat.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
