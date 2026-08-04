'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { DesktopBreakingTicker } from '@/components/home/desktop/DesktopBreakingTicker'
import { BreakingNewsBand } from '@/components/home/desktop/BreakingNewsBand'
import { DesktopHeaderAuth } from '@/components/home/desktop/DesktopHeaderAuth'
import { DesktopSiteNavLinks } from '@/components/home/desktop/DesktopSiteNavLinks'
import { DesktopThemeToggle } from '@/components/home/desktop/DesktopThemeToggle'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'
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
  variant?: 'full' | 'compact'
}

function HeaderBrandWordmark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  return (
    <BrandWordmark
      variant="onBrand"
      size={size}
      showDotCom
      className="font-serif font-bold"
    />
  )
}

function SubcategoryTabs({
  subcategories,
  tabParent,
  compact,
}: {
  subcategories: SubTab[]
  tabParent?: CategoryDef | null
  compact?: boolean
}) {
  return (
    <nav
      className={cn(
        'flex items-stretch overflow-x-auto scrollbar-hide border-t border-white/10 bg-[rgb(var(--header-navy-bg))]',
        compact && 'bg-[rgb(var(--header-navy-bg))]'
      )}
      aria-label={`${tabParent?.name ?? 'Kategori'} alt bölümleri`}
    >
      <div className="flex min-w-max items-stretch scroll-px-3">
        <Link
          href={`/kategori/${tabParent!.slug}`}
          className={cn(
            'shrink-0 font-semibold uppercase tracking-wide transition-colors',
            compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-2.5 text-[12px]',
            subcategories.every((s) => !s.active)
              ? 'border-b-2 border-white text-white'
              : 'text-white/70 hover:text-white'
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
              'shrink-0 font-semibold uppercase tracking-wide transition-colors',
              compact ? 'px-3 py-2 text-[11px]' : 'px-4 py-2.5 text-[12px]',
              sub.active
                ? 'border-b-2 border-white text-white'
                : 'text-white/70 hover:text-white'
            )}
          >
            {sub.name}
          </Link>
        ))}
      </div>
    </nav>
  )
}

export function DesktopWebHeader({
  breakingItems = [],
  showBreaking = false,
  subcategories,
  tabParent,
  className,
  variant = 'full',
}: DesktopWebHeaderProps) {
  const showSubTabs = subcategories && subcategories.length > 0
  const desktopSidebarOpen = useUiStore((s) => s.desktopSidebarOpen)
  const showHeaderBrand = !desktopSidebarOpen

  if (variant === 'compact') {
    return (
      <header
        className={cn(
          'desktop-web-header desktop-web-header--compact desktop-web-header--concept-b py-0',
          className
        )}
        itemScope
        itemType="https://schema.org/WPHeader"
      >
        <div className="flex items-stretch gap-2 bg-[rgb(var(--header-brand-bg))] px-1 text-white">
          {showHeaderBrand ? (
            <Link
              href={ROUTES.FEED}
              className="flex shrink-0 items-center gap-2 py-2 pr-2 transition-opacity hover:opacity-90"
              aria-label="NaHaber Ana Sayfa"
            >
              <HeaderBrandWordmark size="sm" />
            </Link>
          ) : null}

          <nav
            className={cn(
              'min-w-0 flex-1 overflow-x-auto scroll-px-3 scrollbar-hide pl-2',
              showHeaderBrand ? 'border-l border-white/25' : ''
            )}
            aria-label="Haber kategorileri"
          >
            <DesktopSiteNavLinks variant="header-primary" />
          </nav>

          <Link
            href={ROUTES.SEARCH}
            className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg text-white/90 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Haber ara"
          >
            <Search className="h-4 w-4" />
          </Link>

          <DesktopHeaderAuth variant="onBrand" className="shrink-0 self-center" />
        </div>

        {showSubTabs ? (
          <SubcategoryTabs
            subcategories={subcategories}
            tabParent={tabParent}
            compact
          />
        ) : null}
      </header>
    )
  }

  return (
    <header
      className={cn(
        'desktop-web-header desktop-web-header--full desktop-web-header--concept-b mb-6 overflow-hidden rounded-b-sm pb-0',
        className
      )}
      itemScope
      itemType="https://schema.org/WPHeader"
    >
      {/* Concept B — kırmızı üst bar */}
      <div className="relative z-20 flex items-center gap-3 bg-[rgb(var(--header-brand-bg))] px-3 py-2.5 text-white sm:px-4">
        {showHeaderBrand ? (
          <Link
            href={ROUTES.FEED}
            className="relative z-10 flex shrink-0 items-center transition-opacity hover:opacity-90"
            aria-label="NaHaber Ana Sayfa"
            itemProp="url"
          >
            <HeaderBrandWordmark size="lg" />
          </Link>
        ) : null}

        <nav
          className="min-w-0 flex-1 overflow-x-auto scrollbar-hide"
          aria-label="Birincil haber kategorileri"
          itemScope
          itemType="https://schema.org/SiteNavigationElement"
        >
          <DesktopSiteNavLinks variant="header-primary" />
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={ROUTES.SEARCH}
            className="flex h-9 items-center gap-2 rounded-full bg-white px-3.5 text-[13px] font-medium text-slate-500 shadow-sm transition-opacity hover:opacity-95"
            aria-label="Haber ara"
          >
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="hidden sm:inline">Ara</span>
          </Link>
          <DesktopThemeToggle variant="onBrand" />
          <DesktopHeaderAuth variant="onBrand" />
        </div>
      </div>

      {/* Concept B — lacivert ikincil bar */}
      <nav
        className="flex items-center justify-center overflow-x-auto scroll-px-[var(--layout-gutter)] scrollbar-hide bg-[rgb(var(--header-navy-bg))]"
        aria-label="İkincil haber kategorileri"
        itemScope
        itemType="https://schema.org/SiteNavigationElement"
      >
        <DesktopSiteNavLinks variant="header-secondary" className="mx-auto justify-center" />
      </nav>

      {showBreaking && breakingItems.length > 0 ? (
        <>
          <BreakingNewsBand items={breakingItems} />
          <DesktopBreakingTicker items={breakingItems} />
        </>
      ) : null}

      {showSubTabs ? (
        <SubcategoryTabs subcategories={subcategories} tabParent={tabParent} />
      ) : null}
    </header>
  )
}
