'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { DesktopBreakingTicker } from '@/components/home/desktop/DesktopBreakingTicker'
import { DesktopSiteNavLinks } from '@/components/home/desktop/DesktopSiteNavLinks'
import { ROUTES } from '@/constants/routes'
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

interface DesktopWebHeaderProps {
  breakingItems?: NewsItem[]
  showBreaking?: boolean
  subcategories?: SubTab[]
  tabParent?: CategoryDef | null
  className?: string
}

export function DesktopWebHeader({
  breakingItems = [],
  showBreaking = false,
  subcategories,
  tabParent,
  className,
}: DesktopWebHeaderProps) {
  const showSubTabs = subcategories && subcategories.length > 0

  return (
    <header
      className={cn('desktop-web-header mb-6 border-b border-[rgb(var(--color-border))] pb-0', className)}
      itemScope
      itemType="https://schema.org/WPHeader"
    >
      {/* Logo bar — BBC tarzı ortalanmış marka */}
      <div className="relative mb-4 flex items-center justify-center border-b border-[rgb(var(--color-border))] pb-4 pt-1">
        <Link
          href={ROUTES.SEARCH}
          className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-lg text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
          aria-label="Haber ara"
        >
          <Search className="h-5 w-5" />
        </Link>

        <Link
          href={ROUTES.FEED}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          aria-label="NaHaber Ana Sayfa"
          itemProp="url"
        >
          <BrandLogo size="lg" priority />
          <span className="text-2xl font-black tracking-tight" itemProp="name">
            <span className="text-[rgb(var(--color-brand))]">Na</span>
            <span className="text-[rgb(var(--color-text))]">Haber</span>
          </span>
        </Link>
      </div>

      {showBreaking && breakingItems.length > 0 ? (
        <DesktopBreakingTicker items={breakingItems} />
      ) : null}

      <nav
        className="flex items-stretch overflow-x-auto scrollbar-hide border-t border-[rgb(var(--color-border))]"
        aria-label="Haber kategorileri"
        itemScope
        itemType="https://schema.org/SiteNavigationElement"
      >
        <DesktopSiteNavLinks variant="header" />
      </nav>

      {showSubTabs ? (
        <nav
          className="mt-0 flex items-stretch overflow-x-auto scrollbar-hide border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/40"
          aria-label={`${tabParent?.name ?? 'Kategori'} alt bölümleri`}
        >
          <div className="flex min-w-max items-stretch">
            <Link
              href={`/kategori/${tabParent!.slug}`}
              className={cn(
                'shrink-0 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide transition-colors',
                subcategories.every((s) => !s.active)
                  ? 'border-b-2 border-[rgb(var(--color-text))] text-[rgb(var(--color-text))]'
                  : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              Tümü
            </Link>
            {subcategories.map((sub) => (
              <Link
                key={sub.id}
                href={sub.href}
                aria-current={sub.active ? 'page' : undefined}
                className={cn(
                  'shrink-0 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide transition-colors',
                  sub.active
                    ? 'border-b-2 border-[rgb(var(--color-text))] text-[rgb(var(--color-text))]'
                    : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}
              >
                {sub.name}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  )
}
