'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import {
  buildFallbackFeedV2Tabs,
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

/**
 * Live category bar: Sana Özel first, then categories by freshest public publish.
 * Freezes order while the user holds an active non-personal tab (no jump under finger).
 *
 * Tab order is NOT personalized — do not await Firebase auth before fetching.
 * Auth gating previously left mobile on buildFallbackFeedV2Tabs() (Takip #2)
 * while SSR feed content already painted.
 *
 * Presentation: ContextRail. On mobile Global Nav V2, portals into the
 * shared header slot so Ana Sayfa and Akış share one chrome geometry.
 */
export function FeedV2CategoryNav({
  activeTabId,
  onChange,
  className,
  trailing,
  exitHidden = false,
}: FeedV2CategoryNavProps) {
  const [tabs, setTabs] = useState<FeedV2Tab[]>(() => buildFallbackFeedV2Tabs())
  const [tabsSource, setTabsSource] = useState<'fallback' | 'live'>('fallback')
  const frozenRef = useRef<FeedV2Tab[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { element: slot } = useContextRailSlot()
  const [isMobileChrome, setIsMobileChrome] = useState(false)

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

  const globalNavV2 = isGlobalNavV2EnabledClient()

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => setIsMobileChrome(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const display = frozenRef.current && activeTabId !== 'personal' ? frozenRef.current : tabs
  const portaled = Boolean(globalNavV2 && isMobileChrome && slot)

  // Wait for the header slot on mobile so the rail never paints as a second
  // overlay row on the card.
  if (globalNavV2 && isMobileChrome && !slot) {
    return null
  }

  const nav = (
    <ContextRail
      ariaLabel="Feed kategorileri"
      testId="smart-feed-category-nav"
      scrollRef={scrollRef}
      className={cn(
        !portaled &&
          (globalNavV2
            ? 'relative z-10 px-2 pt-1'
            : 'absolute left-0 right-0 top-0 z-50 pl-2 pr-3 pb-2 pt-[max(2.75rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.85rem))]'),
        className
      )}
      leading={<FeedV2ExitButton compact hidden={exitHidden} />}
      trailing={trailing}
    >
      {display.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-tab-id={tab.id}
          onClick={() => onChange(tab)}
          className={contextRailChipClass(activeTabId === tab.id)}
          aria-current={activeTabId === tab.id ? 'page' : undefined}
          aria-label={tab.label}
          role="tab"
        >
          {tab.label}
        </button>
      ))}
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
