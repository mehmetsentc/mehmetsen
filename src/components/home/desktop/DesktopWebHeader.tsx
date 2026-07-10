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
  variant?: 'full' | 'compact'
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
        className={cn('desktop-web-header desktop-web-header--compact py-0', className)}
        itemScope
        itemType="https://schema.org/WPHeader"
      >
        <div className="flex items-stretch gap-2">
          <Link
            href={ROUTES.FEED}
            className="flex shrink-0 items-center gap-1.5 py-2 pr-2 transition-opacity hover:opacity-90"
            aria-label="NaHaber Ana Sayfa"
          >
            <BrandLogo size="sm" />
            <span className="hidden text-sm font-black tracking-tight text-[rgb(var(--color-text))] xl:inline">
              <span className="text-[rgb(var(--color-brand))]">Na</span>Haber
            </span>
          </Link>

          <nav
            className="min-w-0 flex-1 overflow-x-auto scrollbar-hide border-l border-[rgb(var(--color-border))] pl-2"
            aria-label="Haber kategorileri"
          >
            <DesktopSiteNavLinks variant="header" />
          </nav>

          <Link
            href={ROUTES.SEARCH}
            className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg text-[rgb(var(--color-muted))] transition-colors hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
            aria-label="Haber ara"
          >
            <Search className="h-4 w-4" />
          </Link>
        </div>

        {showSubTabs ? (
          <nav
            className="flex items-stretch overflow-x-auto scrollbar-hide border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/60"
            aria-label={`${tabParent?.name ?? 'Kategori'} alt bölümleri`}
          >
            <div className="flex min-w-max items-stretch">
              <Link
                href={`/kategori/${tabParent!.slug}`}
                className={cn(
                  'shrink-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors',
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
                    'shrink-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors',
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
