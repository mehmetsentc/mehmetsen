'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { FeedV2Tab } from '@/lib/feed/feedV2Tabs'
import { isGlobalNavV2EnabledClient } from '@/lib/feed/featureFlagClient'
import { FeedV2ExitButton } from '@/components/feed/smart/FeedV2ExitButton'
import {
  ContextRail,
  contextRailChipClass,
  useContextRailSlot,
} from '@/components/layout/ContextRail'
import { resolveSwipeCategoryKey } from '@/constants/config'
import {
  getSharedRailDestinations,
  isAkisRailChipActive,
  sharedRailAkisItem,
  sharedRailChipLabel,
} from '@/lib/feed/sharedCategoryRail'

interface FeedV2CategoryNavProps {
  activeTabId: string
  onChange: (tab: FeedV2Tab) => void
  className?: string
  trailing?: React.ReactNode
  /** Hide Level-2 exit while Reader (Level 3) owns Back. */
  exitHidden?: boolean
}

/**
 * Canonical category rail for Akış — same destinations/order as Ana Sayfa.
 * Personalization stays the default Smart Feed mode when Tümü is selected.
 * Skor / Oyunlar are not Smart Feed categories; they remain ordinary links.
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
  const pathname = usePathname()
  const destinations = getSharedRailDestinations()

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => setIsMobileChrome(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const btn = el.querySelector<HTMLElement>(`[data-rail-id="${activeTabId === 'personal' ? 'feed' : activeTabId === 'local' ? 'yerel' : activeTabId}"]`)
    btn?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeTabId])

  const globalNavV2 = isGlobalNavV2EnabledClient()
  const portaled = Boolean(globalNavV2 && isMobileChrome && slot)

  // Wait for the header slot on mobile so the rail never paints as a second
  // overlay row on the card.
  if (globalNavV2 && isMobileChrome && !slot) {
    return null
  }

  const nav = (
    <ContextRail
      ariaLabel="Kategoriler"
      testId="smart-feed-category-nav"
      scrollRef={scrollRef}
      className={cn(
        !portaled &&
          (globalNavV2
            ? 'relative z-10 px-2 pt-1'
            : 'absolute left-0 right-0 top-0 z-50 pl-2 pr-3 pb-2 pt-[max(2.75rem,calc(var(--mobile-sat,env(safe-area-inset-top,0px))+0.85rem))]'),
        className
      )}
      leading={portaled ? null : <FeedV2ExitButton compact hidden={exitHidden} />}
      trailing={trailing}
    >
      {destinations.map((dest) => {
        const item = sharedRailAkisItem(dest)
        const linkActive = resolveSwipeCategoryKey(pathname) === dest.id
        const active =
          item.kind === 'link'
            ? linkActive
            : isAkisRailChipActive(dest.id, activeTabId)
        const label = sharedRailChipLabel(dest)

        if (item.kind === 'link') {
          return (
            <Link
              key={dest.id}
              href={item.href}
              data-rail-id={dest.id}
              className={contextRailChipClass(active)}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
            >
              {label}
            </Link>
          )
        }

        return (
          <button
            key={dest.id}
            type="button"
            data-tab-id={item.tab.id}
            data-rail-id={dest.id}
            onClick={() => onChange(item.tab)}
            className={contextRailChipClass(active)}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            role="tab"
          >
            {label}
          </button>
        )
      })}
    </ContextRail>
  )

  const wrapped = (
    <div
      data-region="category-nav"
      data-tabs-source="canonical"
      data-global-nav-v2={globalNavV2 ? '1' : '0'}
      data-context-rail-portaled={portaled ? '1' : '0'}
      className="min-w-0 w-full max-w-full"
    >
      {nav}
    </div>
  )

  if (portaled && slot) {
    return createPortal(wrapped, slot)
  }

  return wrapped
}
