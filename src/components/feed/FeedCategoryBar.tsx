'use client'

import Link from 'next/link'
import { ROUTES } from '@/constants/routes'

export type FeedTab = 'home' | 'gundem' | 'personal'

interface FeedCategoryBarProps {
  activeTab: FeedTab
  onTabChange: (tab: FeedTab) => void
}

const IN_PAGE_TABS: { id: FeedTab; label: string }[] = [
  { id: 'home', label: 'Ana Sayfa' },
  { id: 'gundem', label: 'Gündem' },
  { id: 'personal', label: '✨ Sana Özel' },
]

const NAV_CATEGORIES = [
  { id: 'siyaset',   label: 'Siyaset',   color: '#7C3AED' },
  { id: 'dunya',     label: 'Dünya',     color: '#6B7280' },
  { id: 'spor',      label: 'Spor',      color: '#10B981' },
  { id: 'ekonomi',   label: 'Ekonomi',   color: '#F59E0B' },
  { id: 'teknoloji', label: 'Teknoloji', color: '#3B82F6' },
  { id: 'saglik',    label: 'Sağlık',    color: '#EC4899' },
  { id: 'kultur',    label: 'Kültür',    color: '#8B5CF6' },
  { id: 'magazin',   label: 'Magazin',   color: '#F472B6' },
]

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
                ? 'bg-[rgb(var(--color-primary))] text-white shadow-sm'
                : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-border))]',
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
            href={ROUTES.CATEGORY(cat.id)}
            className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-border))]"
          >
            {cat.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
