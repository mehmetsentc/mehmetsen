'use client'

import { useRef } from 'react'
import { useScrollCompact } from '@/hooks/useScrollCompact'
import { DesktopWebHeader } from '@/components/home/desktop/DesktopWebHeader'
import type { CategoryDef } from '@/constants/config'
import type { NewsItem } from '@/types/newsItem'

interface SubTab {
  id: string
  slug: string
  name: string
  color: string
  href: string
  active: boolean
}

interface DesktopScrollHeaderProps {
  breakingItems?: NewsItem[]
  showBreaking?: boolean
  subcategories?: SubTab[]
  tabParent?: CategoryDef | null
  /** px — tam header görünürken kompakt çubuğu gösterme eşiği */
  threshold?: number
}

/**
 * Gazete masthead: üstte tam kâğıt başlık, kaydırınca kompakt kategori şeridi.
 */
export function DesktopScrollHeader({
  threshold = 200,
  ...headerProps
}: DesktopScrollHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const compact = useScrollCompact(threshold)

  return (
    <>
      {compact ? (
        <div
          className="desktop-scroll-header-compact pointer-events-auto fixed top-0 z-50 hidden translate-y-0 opacity-100 transition-all duration-300 ease-out lg:block"
          aria-hidden={false}
        >
          <div className="desktop-scroll-header-compact-inner">
            <DesktopWebHeader {...headerProps} variant="compact" className="mb-0 border-b-0" />
          </div>
        </div>
      ) : null}

      <div ref={sentinelRef} className="hidden lg:block">
        <DesktopWebHeader {...headerProps} variant="full" />
      </div>
    </>
  )
}
