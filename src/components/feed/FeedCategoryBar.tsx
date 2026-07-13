'use client'

export type FeedTab = 'home' | 'trend'

interface FeedCategoryBarProps {
  activeTab: FeedTab
  onTabChange: (tab: FeedTab) => void
}

const IN_PAGE_TABS: { id: FeedTab; label: string }[] = [
  { id: 'home', label: 'Ana Sayfa' },
  { id: 'trend', label: 'Trend' },
]

/**
 * In-page home/trend switcher. Not sticky — sits under Navbar + CategoryNav
 * without fighting their sticky offsets.
 */
export function FeedCategoryBar({ activeTab, onTabChange }: FeedCategoryBarProps) {
  return (
    <div className="-mx-4 mb-2 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] lg:hidden">
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 scrollbar-hide">
        {IN_PAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={[
              'flex min-h-10 flex-shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-all',
              activeTab === tab.id
                ? 'bg-[rgb(var(--color-brand))] text-white'
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
