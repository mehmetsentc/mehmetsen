'use client'

import Link from 'next/link'
import { Menu, PanelLeftClose, Search } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { DesktopBreakingTicker } from '@/components/home/desktop/DesktopBreakingTicker'
import { DesktopHeaderAuth } from '@/components/home/desktop/DesktopHeaderAuth'
import { DesktopSiteNavLinks } from '@/components/home/desktop/DesktopSiteNavLinks'
import { formatNewsDateLong } from '@/components/home/desktop/formatNewsDate'
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
        'flex shrink-0 items-center justify-center text-[rgb(var(--color-text))]/70 transition-colors hover:text-[rgb(var(--color-text))]',
        compact ? 'h-8 w-8' : 'h-9 w-9'
      )}
    >
      <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={1.75} />
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

function SubcategoryTabs({
  subcategories,
  tabParent,
}: {
  subcategories: SubTab[]
  tabParent?: CategoryDef | null
}) {
  return (
    <nav
      className="nl-masthead-subnav"
      aria-label={`${tabParent?.name ?? 'Kategori'} alt bölümleri`}
    >
      <Link
        href={`/kategori/${tabParent!.slug}`}
        className={cn(
          'nl-masthead-subnav__link',
          subcategories.every((s) => !s.active) && 'is-active'
        )}
      >
        Tümü
      </Link>
      {subcategories.map((sub) => (
        <Link
          key={sub.id}
          href={sub.href}
          aria-current={sub.active ? 'page' : undefined}
          className={cn('nl-masthead-subnav__link', sub.active && 'is-active')}
        >
          {sub.name}
        </Link>
      ))}
    </nav>
  )
}

const UTILITY_SOCIAL = [
  { label: 'X', href: process.env.NEXT_PUBLIC_X_URL ?? 'https://x.com/nahabercom' },
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/nahabercom' },
] as const

export function DesktopWebHeader({
  breakingItems = [],
  showBreaking = false,
  subcategories,
  tabParent,
  className,
  variant = 'full',
}: DesktopWebHeaderProps) {
  const showSubTabs = Boolean(subcategories && subcategories.length > 0 && tabParent)

  if (variant === 'compact') {
    return (
      <header
        className={cn(
          'desktop-web-header desktop-web-header--compact desktop-web-header--newspaper py-0',
          className
        )}
        itemScope
        itemType="https://schema.org/WPHeader"
      >
        <div className="nl-masthead-compact">
          <HeaderSidebarToggle compact />
          <Link
            href={ROUTES.FEED}
            className="flex items-center pr-3"
            aria-label="NaHaber Ana Sayfa"
          >
            <BrandWordmark variant="default" size="sm" showDotCom className="font-serif font-bold" />
          </Link>
          <nav className="min-w-0 flex-1 overflow-x-auto scrollbar-hide" aria-label="Haber kategorileri">
            <DesktopSiteNavLinks variant="header-newspaper" className="justify-start" />
          </nav>
          <Link
            href={ROUTES.SEARCH}
            className="flex h-8 w-8 shrink-0 items-center justify-center text-[rgb(var(--color-text))]/70 hover:text-[rgb(var(--color-text))]"
            aria-label="Haber ara"
          >
            <Search className="h-4 w-4" />
          </Link>
        </div>
      </header>
    )
  }

  return (
    <header
      className={cn(
        'desktop-web-header desktop-web-header--full desktop-web-header--newspaper mb-6',
        className
      )}
      itemScope
      itemType="https://schema.org/WPHeader"
    >
      <div className="nl-masthead-utility">
        <div className="nl-masthead-utility__left">
          <HeaderSidebarToggle />
          <p className="nl-masthead-utility__meta m-0 capitalize">{formatNewsDateLong()}</p>
          <Link href={ROUTES.WEATHER} className="nl-masthead-utility__meta hover:underline">
            Hava Durumu
          </Link>
        </div>
        <p className="nl-masthead-utility__edition">Dijital Gazete · Türkiye</p>
        <div className="nl-masthead-utility__right">
          <Link href="/hakkimizda" className="nl-masthead-utility__meta hover:underline">
            Hakkımızda
          </Link>
          <Link href="/iletisim" className="nl-masthead-utility__meta hover:underline">
            İletişim
          </Link>
          {UTILITY_SOCIAL.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="nl-masthead-utility__meta hover:underline"
            >
              {item.label}
            </a>
          ))}
          <Link
            href={ROUTES.SEARCH}
            className="flex h-8 w-8 items-center justify-center text-[rgb(var(--color-text))]/70 hover:text-[rgb(var(--color-text))]"
            aria-label="Haber ara"
          >
            <Search className="h-4 w-4" />
          </Link>
          <NotificationBell
            variant="default"
            iconClassName="h-4 w-4"
            buttonClassName="relative flex h-8 w-8 items-center justify-center text-[rgb(var(--color-text))]/70 transition-colors hover:text-[rgb(var(--color-text))]"
          />
          <DesktopHeaderAuth variant="default" className="shrink-0" />
        </div>
      </div>

      <Link
        href={ROUTES.FEED}
        className="nl-masthead-brand block no-underline"
        aria-label="NaHaber Ana Sayfa"
        itemProp="url"
      >
        <BrandWordmark
          variant="default"
          size="xl"
          showDotCom
          className="nl-masthead__title font-serif font-black"
        />
      </Link>

      <hr className="nl-rule-thick mb-0" />

      <nav className="nl-masthead-nav" aria-label="Haber kategorileri">
        <DesktopSiteNavLinks variant="header-newspaper" />
      </nav>

      <hr className="nl-rule mt-0" />

      {showBreaking && breakingItems.length > 0 ? (
        <DesktopBreakingTicker items={breakingItems} />
      ) : null}

      {showSubTabs ? (
        <SubcategoryTabs subcategories={subcategories!} tabParent={tabParent} />
      ) : null}
    </header>
  )
}
