'use client'

import { useEffect, useRef, useState } from 'react'
import { DesktopWebHeader } from '@/components/home/desktop/DesktopWebHeader'
import { cn } from '@/lib/utils'
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
 * NYT tarzı scroll header: sayfa üstündeyken tam masthead, aşağı kaydırınca
 * üstte sabit kompakt kategori çubuğu.
 */
export function DesktopScrollHeader({
  threshold = 80,
  ...headerProps
}: DesktopScrollHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const onScroll = () => setCompact((window.scrollY || 0) > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return (
    <>
      <div
        className={cn(
          'desktop-scroll-header-compact pointer-events-none fixed top-0 z-50 hidden -translate-y-full opacity-0 transition-all duration-300 ease-out lg:block',
          compact && 'pointer-events-auto translate-y-0 opacity-100'
        )}
        aria-hidden={!compact}
      >
        <div className="desktop-scroll-header-compact-inner">
          <DesktopWebHeader {...headerProps} variant="compact" className="mb-0 border-b-0" />
        </div>
      </div>

      <div ref={sentinelRef} className="hidden lg:block">
        <DesktopWebHeader {...headerProps} variant="full" />
      </div>
    </>
  )
}
