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
 * Mobile editorial: compact text tabs (not heavy pills) so the hero can own the viewport.
 */
export function FeedCategoryBar({ activeTab, onTabChange }: FeedCategoryBarProps) {
  return (
    <div className="mb-1 bg-[rgb(var(--color-surface))] lg:hidden max-md:mb-0">
      <div
        className="flex items-center gap-5 overflow-x-auto px-4 py-1.5 scrollbar-hide max-md:min-h-0 max-md:py-2"
        role="tablist"
        aria-label="Akış görünümü"
      >
        {IN_PAGE_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={[
                'relative flex min-h-11 flex-shrink-0 items-center text-[15px] font-semibold transition-colors',
                isActive
                  ? 'text-[rgb(var(--color-brand))]'
                  : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
              ].join(' ')}
            >
              {tab.label}
              {isActive ? (
                <span className="absolute bottom-1 left-0 right-0 h-[2px] rounded-full bg-[rgb(var(--color-brand))]" />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
