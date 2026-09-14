'use client'

import Link from 'next/link'
import { Home, Search } from 'lucide-react'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { DesktopBreakingTicker } from '@/components/home/desktop/DesktopBreakingTicker'
import { DesktopPortalWeather } from '@/components/home/desktop/DesktopPortalWeather'
import { formatNewsDateLong } from '@/components/home/desktop/formatNewsDate'
import { getHeaderPortalNavItems } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import type { NewsItem } from '@/types/newsItem'

const PORTAL_NAV = getHeaderPortalNavItems()

const SOCIAL = [
  { label: 'X', href: process.env.NEXT_PUBLIC_X_URL ?? 'https://x.com/nahabercom' },
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/nahabercom' },
  { label: 'Instagram', href: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? 'https://www.instagram.com/nahabercom' },
  { label: 'YouTube', href: process.env.NEXT_PUBLIC_YOUTUBE_URL ?? 'https://www.youtube.com/@nahabercom' },
] as const

export function DesktopPortalFullHeader({
  breakingItems = [],
  showBreaking = false,
  className,
}: {
  breakingItems?: NewsItem[]
  showBreaking?: boolean
  className?: string
}) {
  return (
    <header
      className={cn('desktop-web-header desktop-web-header--portal mb-5', className)}
      itemScope
      itemType="https://schema.org/WPHeader"
      data-testid="desktop-portal-header"
    >
      <div className="desktop-portal-utility">
        <div className="desktop-web-header__inner desktop-portal-utility__inner">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <p className="desktop-portal-utility__meta m-0 capitalize">{formatNewsDateLong()}</p>
            <DesktopPortalWeather />
            <span className="desktop-portal-utility__meta hidden xl:inline">
              Dijital Gazete — Türkiye
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/hakkimizda" className="desktop-portal-utility__link">
              Hakkımızda
            </Link>
            <Link href="/iletisim" className="desktop-portal-utility__link">
              İletişim
            </Link>
            <div className="hidden items-center gap-2 sm:flex">
              {SOCIAL.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer me"
                  aria-label={`NaHaber ${item.label}`}
                  className="desktop-portal-utility__link"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="desktop-portal-masthead">
        <div className="desktop-web-header__inner desktop-portal-masthead__inner">
          <Link
            href={ROUTES.FEED}
            className="desktop-portal-masthead__brand"
            aria-label="NaHaber Ana Sayfa"
            itemProp="url"
          >
            <BrandWordmark variant="default" size="lg" className="font-black !text-[2.35rem]" />
            <span className="desktop-portal-masthead__tagline">Dijital Gazete — Türkiye</span>
          </Link>
        </div>
      </div>

      <nav className="desktop-portal-nav" aria-label="Haber kategorileri">
        <div className="desktop-web-header__inner desktop-portal-nav__inner">
          <Link
            href={ROUTES.FEED}
            aria-label="Ana Sayfa"
            aria-current="page"
            className="desktop-portal-nav__home"
          >
            <Home className="h-4 w-4" strokeWidth={2.25} />
          </Link>
          <ul className="desktop-portal-nav__list">
            {PORTAL_NAV.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="desktop-portal-nav__link" title={`${item.label} haberleri`}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={ROUTES.SEARCH} className="desktop-portal-nav__search" aria-label="Haber ara">
            <Search className="h-4 w-4" strokeWidth={2.2} />
          </Link>
        </div>
      </nav>

      {showBreaking && breakingItems.length > 0 ? (
        <DesktopBreakingTicker items={breakingItems} variant="portal" />
      ) : null}
    </header>
  )
}
