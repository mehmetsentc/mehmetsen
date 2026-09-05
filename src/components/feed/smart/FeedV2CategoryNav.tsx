'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  buildFallbackFeedV2Tabs,
  type FeedV2Tab,
} from '@/lib/feed/feedV2Tabs'

interface FeedV2CategoryNavProps {
  activeTabId: string
  onChange: (tab: FeedV2Tab) => void
  className?: string
  trailing?: React.ReactNode
}

/**
 * Live category bar: Sana Özel first, then categories by freshest public publish.
 * Freezes order while the user holds an active non-personal tab (no jump under finger).
 *
 * Tab order is NOT personalized — do not await Firebase auth before fetching.
 * Auth gating previously left mobile on buildFallbackFeedV2Tabs() (Takip #2)
 * while SSR feed content already painted.
 */
export function FeedV2CategoryNav({
  activeTabId,
  onChange,
  className,
  trailing,
}: FeedV2CategoryNavProps) {
  const [tabs, setTabs] = useState<FeedV2Tab[]>(() => buildFallbackFeedV2Tabs())
  const [tabsSource, setTabsSource] = useState<'fallback' | 'live'>('fallback')
  const frozenRef = useRef<FeedV2Tab[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function loadTabs(opts?: { force?: boolean }) {
      try {
        // Don't reshuffle under an active category browse session.
        if (!opts?.force && frozenRef.current && activeTabId !== 'personal') {
          return
        }
        // Public activity order — no Authorization. Waiting on Firebase auth
        // delayed/blocked mobile reconcile and left Takip #2 fallback visible.
        const res = await fetch('/api/feed/v2/tabs', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[FeedV2CategoryNav] tabs fetch not ok', res.status)
          }
          return
        }
        const data = (await res.json()) as { tabs?: FeedV2Tab[] }
        if (cancelled || !data.tabs?.length) return
        if (frozenRef.current && activeTabId !== 'personal') {
          return
        }
        setTabs(data.tabs)
        setTabsSource('live')
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[FeedV2CategoryNav] tabs fetch failed', err)
        }
        /* keep fallback */
      }
    }

    void loadTabs()

    // Reconcile when returning to the feed surface on Sana Özel (safe refresh point).
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (activeTabId !== 'personal') return
      void loadTabs({ force: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [activeTabId])

  useEffect(() => {
    if (activeTabId === 'personal') {
      frozenRef.current = null
      return
    }
    frozenRef.current = tabs
  }, [activeTabId, tabs])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const btn = el.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`)
    btn?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeTabId])

  const display = frozenRef.current && activeTabId !== 'personal' ? frozenRef.current : tabs

  return (
    <nav
      className={cn(
        'absolute left-0 right-0 top-0 z-50 flex items-center gap-2',
        'pl-14 pr-3 pb-2',
        'pt-[max(2.75rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.85rem))]',
        className
      )}
      aria-label="Feed kategorileri"
      data-testid="smart-feed-category-nav"
      data-region="category-nav"
      data-tabs-source={tabsSource}
    >
      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-full bg-black/45 p-1 backdrop-blur-md border border-white/10 scrollbar-none"
        role="tablist"
      >
        {display.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-tab-id={tab.id}
            onClick={() => onChange(tab)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all select-none whitespace-nowrap',
              activeTabId === tab.id
                ? 'bg-white text-black shadow-sm'
                : 'text-white/72 hover:text-white'
            )}
            aria-current={activeTabId === tab.id ? 'page' : undefined}
            aria-label={tab.label}
            role="tab"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </nav>
  )
}
