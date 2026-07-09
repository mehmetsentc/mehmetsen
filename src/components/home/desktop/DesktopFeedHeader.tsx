'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getTopNavCategories } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { formatNewsDateLong } from '@/components/home/desktop/formatNewsDate'
import { DesktopBreakingTicker } from '@/components/home/desktop/DesktopBreakingTicker'
import type { FeedTab } from '@/components/feed/FeedCategoryBar'
import type { NewsItem } from '@/types/newsItem'

const CATEGORY_LINKS = getTopNavCategories()

interface DesktopFeedHeaderProps {
  activeTab: FeedTab
  onTabChange: (tab: FeedTab) => void
  breakingItems: NewsItem[]
}

export function DesktopFeedHeader({ activeTab, onTabChange, breakingItems }: DesktopFeedHeaderProps) {
  const pathname = usePathname()
  const isFeed = pathname === ROUTES.FEED

  if (!isFeed) return null

  return (
    <header className="desktop-news-header mb-6 border-b border-[rgb(var(--color-border))] pb-0">
      <div className="mb-3 flex items-center justify-between text-xs text-[rgb(var(--color-muted))]">
        <span className="font-medium capitalize">{formatNewsDateLong()}</span>
        <span>Türkiye · NaHaber Web</span>
      </div>

      <DesktopBreakingTicker items={breakingItems} />

      <nav
        className="flex items-stretch overflow-x-auto scrollbar-hide border-t border-[rgb(var(--color-border))]"
        aria-label="Bölümler ve kategoriler"
      >
        <div className="flex min-w-max items-stretch">
          {([
            { id: 'home' as FeedTab, label: 'Ana Sayfa' },
            { id: 'trend' as FeedTab, label: 'Trend' },
          ]).map((tab, tabIndex) => {
            const active = activeTab === tab.id
            return (
              <div key={tab.id} className="flex items-stretch">
                {tabIndex > 0 ? (
                  <span className="my-3 w-px shrink-0 bg-[rgb(var(--color-border))]" aria-hidden />
                ) : null}
                <button
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={cn(
                    'shrink-0 px-4 py-3 text-[13px] font-semibold transition-colors',
                    active
                      ? 'text-[rgb(var(--color-text))]'
                      : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                  )}
                >
                  <span className="relative inline-block">
                    {tab.label}
                    {active ? (
                      <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-[rgb(var(--color-text))]" />
                    ) : null}
                  </span>
                </button>
              </div>
            )
          })}

          {CATEGORY_LINKS.map((cat) => {
            const active = pathname.startsWith(cat.href)
            return (
              <div key={cat.id} className="flex items-stretch">
                <span className="my-3 w-px shrink-0 bg-[rgb(var(--color-border))]" aria-hidden />
                <Link
                  href={cat.href}
                  className={cn(
                    'shrink-0 px-4 py-3 text-[13px] font-medium transition-colors',
                    active
                      ? 'font-semibold text-[rgb(var(--color-text))]'
                      : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                  )}
                >
                  <span className="relative inline-block whitespace-nowrap">
                    {cat.label}
                    {active ? (
                      <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-[rgb(var(--color-text))]" />
                    ) : null}
                  </span>
                </Link>
              </div>
            )
          })}

          <div className="flex items-stretch">
            <span className="my-3 w-px shrink-0 bg-[rgb(var(--color-border))]" aria-hidden />
            <Link
              href={ROUTES.LOCAL}
              className={cn(
                'shrink-0 px-4 py-3 text-[13px] font-medium transition-colors',
                pathname.startsWith(ROUTES.LOCAL)
                  ? 'font-semibold text-[rgb(var(--color-text))]'
                  : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              <span className="relative inline-block whitespace-nowrap">
                Yerel
                {pathname.startsWith(ROUTES.LOCAL) ? (
                  <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-[rgb(var(--color-text))]" />
                ) : null}
              </span>
            </Link>
          </div>
        </div>
      </nav>
    </header>
  )
}
