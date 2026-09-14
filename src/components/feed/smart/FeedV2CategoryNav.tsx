'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import {
  buildFallbackFeedV2Tabs,
  ensurePersonalLeadTabs,
  isFeedV2TabActive,
  type FeedV2Tab,
} from '@/lib/feed/feedV2Tabs'
import { isGlobalNavV2EnabledClient } from '@/lib/feed/featureFlagClient'
import { FeedV2ExitButton } from '@/components/feed/smart/FeedV2ExitButton'
import {
  ContextRail,
  contextRailChipClass,
  useContextRailSlot,
} from '@/components/layout/ContextRail'

interface FeedV2CategoryNavProps {
  activeTabId: string
  onChange: (tab: FeedV2Tab) => void
  className?: string
  trailing?: React.ReactNode
  /** Hide Level-2 exit while Reader (Level 3) owns Back. */
  exitHidden?: boolean
}

function isTabPayload(value: unknown): value is FeedV2Tab {
  if (!value || typeof value !== 'object') return false
  const tab = value as FeedV2Tab
  return (
    typeof tab.id === 'string' &&
    typeof tab.label === 'string' &&
    (tab.kind === 'mode' || tab.kind === 'category')
  )
}

/**
 * Feed 2 category rail: Sana Özel first, then categories by newest eligible news.
 * Chips stay transparent over the card and scroll horizontally.
 */
export function FeedV2CategoryNav({
  activeTabId,
  onChange,
  className,
  trailing,
  exitHidden = false,
}: FeedV2CategoryNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { element: slot } = useContextRailSlot()
  const [isMobileChrome, setIsMobileChrome] = useState(false)
  const [tabs, setTabs] = useState<FeedV2Tab[]>(() => buildFallbackFeedV2Tabs())
  const [tabsSource, setTabsSource] = useState<'fallback' | 'activity'>('fallback')

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => setIsMobileChrome(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadActivityTabs() {
      try {
        const res = await fetch('/api/feed/v2/tabs', { cache: 'no-store' })
        if (!res.ok) return
        const data: unknown = await res.json()
        const raw = data && typeof data === 'object' ? (data as { tabs?: unknown }).tabs : null
        if (!Array.isArray(raw)) return
        const parsed = raw.filter(isTabPayload)
        if (parsed.length === 0) return
        const next = ensurePersonalLeadTabs(parsed)
        if (cancelled || next[0]?.id !== 'personal') return
        setTabs(next)
        setTabsSource('activity')
      } catch {
        // Keep fallback: Sana Özel + deterministic categories.
      }
    }

    void loadActivityTabs()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const btn = el.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`)
    btn?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeTabId, tabs])

  const globalNavV2 = isGlobalNavV2EnabledClient()
  const portaled = Boolean(globalNavV2 && isMobileChrome && slot)

  if (globalNavV2 && isMobileChrome && !slot) {
    return null
  }

  const nav = (
    <ContextRail
      ariaLabel="Kategoriler"
      testId="smart-feed-category-nav"
      scrollRef={scrollRef}
      className={cn(
        'feed-v2-cat-rail',
        !portaled &&
          (globalNavV2
            ? 'relative z-10 px-2 pt-1'
            : 'absolute left-0 right-0 top-0 z-50 pl-2 pr-3 pb-2 pt-[max(2.75rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.85rem))]'),
        className
      )}
      leading={portaled ? null : <FeedV2ExitButton compact hidden={exitHidden} />}
      trailing={trailing}
    >
      {tabs.map((tab) => {
        const active = isFeedV2TabActive(tab, activeTabId)
        return (
          <button
            key={tab.id}
            type="button"
            data-tab-id={tab.id}
            data-rail-id={tab.id}
            onClick={() => onChange(tab)}
            className={cn(contextRailChipClass(active), 'feed-v2-cat-chip')}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.label}
            role="tab"
          >
            {tab.label}
          </button>
        )
      })}
    </ContextRail>
  )

  const wrapped = (
    <div
      data-region="category-nav"
      data-tabs-source={tabsSource}
      data-global-nav-v2={globalNavV2 ? '1' : '0'}
      data-context-rail-portaled={portaled ? '1' : '0'}
    >
      {nav}
    </div>
  )

  if (portaled && slot) {
    return createPortal(wrapped, slot)
  }

  return wrapped
}
