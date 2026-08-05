'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Menu, PanelLeftClose, Search } from 'lucide-react'
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

function HeaderSidebarToggle({ compact }: { compact?: boolean }) {
  const desktopSidebarOpen = useUiStore((s) => s.desktopSidebarOpen)
  const toggleDesktopSidebar = useUiStore((s) => s.toggleDesktopSidebar)
  const Icon = desktopSidebarOpen ? PanelLeftClose : Menu

  return (
    <button
      type="button"
      onClick={toggleDesktopSidebar}
      aria-label={desktopSidebarOpen ? 'Kenar çubuğunu kapat' : 'Kenar çubuğunu aç'}
      aria-expanded={desktopSidebarOpen}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/15 hover:text-white',
        compact ? 'h-9 w-9' : 'h-10 w-10'
      )}
    >
      <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2} />
    </button>
  )
}

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

/** Content-width header bar — charcoal navy shell (#11192B) in both themes. */
function HeaderBar({
  tone,
  className,
  innerClassName,
  children,
  as: Tag = 'div',
  'aria-label': ariaLabel,
}: {
  tone: 'brand' | 'navy'
  className?: string
  innerClassName?: string
  children: ReactNode
  as?: 'div' | 'nav'
  'aria-label'?: string
}) {
  return (
    <Tag
      className={cn(
        'desktop-web-header__bar w-full max-w-full',
        tone === 'brand' ? 'desktop-web-header__bar--brand' : 'desktop-web-header__bar--navy',
        className
      )}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      <div className={cn('desktop-web-header__inner w-full max-w-full', innerClassName)}>
        {children}
      </div>
    </Tag>
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
    <HeaderBar
      as="nav"
      tone="navy"
      className="border-t border-white/10"
      aria-label={`${tabParent?.name ?? 'Kategori'} alt bölümleri`}
      innerClassName={cn(
        'flex items-stretch overflow-x-auto scrollbar-hide',
        compact ? 'px-1' : 'px-3 sm:px-4'
      )}
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
    </HeaderBar>
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
        <HeaderBar
          tone="brand"
          className="text-white"
          innerClassName="flex items-center gap-2 px-1"
        >
          <div className="flex shrink-0 items-center gap-1 py-2 pl-1">
            <HeaderSidebarToggle compact />
            <Link
              href={ROUTES.FEED}
              className="flex items-center gap-2 pr-2 transition-opacity hover:opacity-90"
              aria-label="NaHaber Ana Sayfa"
            >
              <HeaderBrandWordmark size="sm" />
            </Link>
          </div>

          <div className="flex-1" />

          <Link
            href={ROUTES.SEARCH}
            className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg text-white/90 transition-colors hover:bg-white/15 hover:text-white"
            aria-label="Haber ara"
          >
            <Search className="h-4 w-4" />
          </Link>

          <DesktopHeaderAuth variant="onBrand" className="shrink-0 self-center" />
        </HeaderBar>

        <HeaderBar
          as="nav"
          tone="navy"
          aria-label="Haber kategorileri"
          innerClassName="flex items-center overflow-x-auto scrollbar-hide px-1"
        >
          <DesktopSiteNavLinks variant="header-all" className="w-full justify-start" />
        </HeaderBar>

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
        'desktop-web-header desktop-web-header--full desktop-web-header--concept-b mb-6 pb-0',
        className
      )}
      itemScope
      itemType="https://schema.org/WPHeader"
    >
      {/* Theme D kömür bar — gazete content sütunu genişliğinde */}
      <HeaderBar
        tone="brand"
        className="relative z-20 text-white"
        innerClassName="flex items-center gap-3 px-3 py-2.5 sm:px-4"
      >
        <div className="relative z-10 flex shrink-0 items-center gap-1.5">
          <HeaderSidebarToggle />
          <Link
            href={ROUTES.FEED}
            className="flex items-center transition-opacity hover:opacity-90"
            aria-label="NaHaber Ana Sayfa"
            itemProp="url"
          >
            <HeaderBrandWordmark size="lg" />
          </Link>
        </div>

        <div className="flex-1" />

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
      </HeaderBar>

      <HeaderBar
        as="nav"
        tone="navy"
        aria-label="Haber kategorileri"
        innerClassName="flex items-center overflow-x-auto scrollbar-hide px-3 sm:px-4"
      >
        <DesktopSiteNavLinks
          variant="header-all"
          className="w-full justify-start"
        />
      </HeaderBar>

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
