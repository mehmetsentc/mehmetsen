'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  buildFallbackFeedV2Tabs,
  type FeedV2Tab,
} from '@/lib/feed/feedV2Tabs'
import { getClientAuthToken } from '@/lib/firebase/auth'

interface FeedV2CategoryNavProps {
  activeTabId: string
  onChange: (tab: FeedV2Tab) => void
  className?: string
  trailing?: React.ReactNode
}

/**
 * Live category bar: Sana Özel first, then categories by freshest public publish.
 * Freezes order while the user holds an active non-personal tab (no jump under finger).
 */
export function FeedV2CategoryNav({
  activeTabId,
  onChange,
  className,
  trailing,
}: FeedV2CategoryNavProps) {
  const [tabs, setTabs] = useState<FeedV2Tab[]>(() => buildFallbackFeedV2Tabs())
  const frozenRef = useRef<FeedV2Tab[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const headers: Record<string, string> = {}
        const token = await getClientAuthToken()
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch('/api/feed/v2/tabs', {
          headers,
          credentials: 'include',
        })
        if (!res.ok) return
        const data = (await res.json()) as { tabs?: FeedV2Tab[] }
        if (cancelled || !data.tabs?.length) return
        // Don't reshuffle under an active category browse session.
        if (frozenRef.current && activeTabId !== 'personal') {
          return
        }
        setTabs(data.tabs)
      } catch {
        /* keep fallback */
      }
    })()
    return () => {
      cancelled = true
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
