'use client'

export type FeedTab = 'home' | 'trend'

interface FeedCategoryBarProps {
  activeTab: FeedTab
  onTabChange: (tab: FeedTab) => void
}

const IN_PAGE_TABS: { id: FeedTab; label: string }[] = [
  { id: 'home',  label: 'Ana Sayfa' },
  { id: 'trend', label: 'Trend' },
]

export function FeedCategoryBar({ activeTab, onTabChange }: FeedCategoryBarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/95 backdrop-blur-sm lg:hidden">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 scrollbar-hide">
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
      </div>
    </div>
  )
}
