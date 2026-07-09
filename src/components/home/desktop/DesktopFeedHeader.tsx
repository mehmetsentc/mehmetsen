'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getSwipeableFeedDestinations } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { formatNewsDateLong } from '@/components/home/desktop/formatNewsDate'
import type { FeedTab } from '@/components/feed/FeedCategoryBar'

const NAV = getSwipeableFeedDestinations()

interface DesktopFeedHeaderProps {
  activeTab: FeedTab
  onTabChange: (tab: FeedTab) => void
}

export function DesktopFeedHeader({ activeTab, onTabChange }: DesktopFeedHeaderProps) {
  const pathname = usePathname()
  const isFeed = pathname === ROUTES.FEED

  if (!isFeed) return null

  return (
    <header className="desktop-news-header mb-6 border-b border-[rgb(var(--color-border))] pb-4">
      <div className="mb-3 flex items-center justify-between text-xs text-[rgb(var(--color-muted))]">
        <span className="font-medium capitalize">{formatNewsDateLong()}</span>
        <span>Türkiye · NaHaber Web</span>
      </div>

      <nav className="mb-3 flex items-center gap-1 border-b border-[rgb(var(--color-border))]" aria-label="Ana bölümler">
        {([
          { id: 'home' as FeedTab, label: 'Ana Sayfa' },
          { id: 'trend' as FeedTab, label: 'Trend' },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-semibold transition-colors',
              activeTab === tab.id
                ? 'text-[rgb(var(--color-text))]'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[rgb(var(--color-text))]" />
            )}
          </button>
        ))}
      </nav>

      <nav className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="Kategoriler">
        {NAV.map((cat) => {
          const active = cat.id === 'feed' ? pathname === ROUTES.FEED && activeTab === 'home' : pathname.startsWith(cat.href)
          return (
            <Link
              key={cat.id}
              href={cat.href}
              className={cn(
                'rounded px-3 py-1.5 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-card))]'
                  : 'text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {cat.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
