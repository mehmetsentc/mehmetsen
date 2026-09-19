'use client'

import Link from 'next/link'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import {
  CityDesktopMenuButton,
  CityDesktopThemeButton,
} from '@/components/city/CityDesktopHeaderChrome'
import { CITY_NEWSPAPER_NAV } from '@/lib/cityNewspaperNav'
import { ROUTES } from '@/constants/routes'
import { useScrollHeaderContext } from '@/context/ScrollHeaderContext'
import { newsItemDetailHref } from '@/lib/newsItemUtils'
import type { NewsItem } from '@/types/newsItem'

const SOCIAL = [
  { label: 'Facebook', href: process.env.NEXT_PUBLIC_FACEBOOK_URL ?? 'https://www.facebook.com/nahabercom' },
  { label: 'X', href: process.env.NEXT_PUBLIC_X_URL ?? 'https://x.com/nahabercom' },
] as const

export function CityDesktopNewspaperHeader({
  cityName,
  breakingItems = [],
}: {
  cityName: string
  breakingItems?: NewsItem[]
}) {
  const { config } = useScrollHeaderContext()
  const breaking = breakingItems[0] ?? config.breakingItems?.[0]

  return (
    <header
      className="desktop-web-header desktop-web-header--portal mb-5 w-full max-w-none"
      itemScope
      itemType="https://schema.org/WPHeader"
      data-testid="desktop-portal-header"
    >
      <div className="desktop-portal-utility">
        <div className="desktop-web-header__inner desktop-portal-utility__inner">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <CityDesktopMenuButton />
            <Link href={ROUTES.WEATHER} className="desktop-portal-utility__link">
              Hava Durumu
            </Link>
            <span className="desktop-portal-utility__meta hidden xl:inline">
              {cityName} dijital gazetesi
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/hakkimizda" className="desktop-portal-utility__link">
              Hakkımızda
            </Link>
            <Link href="/iletisim" className="desktop-portal-utility__link">
              İletişim
            </Link>
            {SOCIAL.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer me"
                className="desktop-portal-utility__link hidden sm:inline"
              >
                {item.label}
              </a>
            ))}
            <CityDesktopThemeButton />
            <Link href={ROUTES.SEARCH} className="desktop-portal-utility__link" aria-label="Haber ara">
              Ara
            </Link>
            <Link href={ROUTES.LOGIN} className="desktop-portal-utility__link">
              Giriş Yap
            </Link>
          </div>
        </div>
      </div>

      <div className="desktop-portal-masthead">
        <div className="desktop-web-header__inner desktop-portal-masthead__inner city-portal-masthead-inner">
          <Link
            href="/"
            className="desktop-portal-masthead__brand city-portal-masthead-brand no-underline"
            aria-label={`${cityName} NaHaber`}
          >
            <span className="city-masthead-lockup">
              <span className="city-masthead-city font-serif font-black leading-none tracking-tight">
                {cityName}
              </span>
              <BrandWordmark
                variant="default"
                size="lg"
                className="nl-masthead__title city-masthead-title font-serif font-black"
              />
            </span>
          </Link>
        </div>
      </div>

      <nav className="desktop-portal-nav city-portal-nav-sticky" aria-label="Haber kategorileri">
        <div className="desktop-web-header__inner desktop-portal-nav__inner">
          <ul className="desktop-portal-nav__list">
            {CITY_NEWSPAPER_NAV.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  prefetch={false}
                  className="desktop-portal-nav__link"
                  title={`${item.label} haberleri`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={ROUTES.SEARCH} className="desktop-portal-nav__search" aria-label="Haber ara">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.2" />
              <path d="M16 16l5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </nav>

      {breaking ? (
        <div className="desktop-portal-breaking" aria-label="Son dakika">
          <div className="desktop-web-header__inner desktop-portal-breaking__inner flex items-center">
            <Link href="/kategori/son-dakika" className="desktop-portal-breaking__label">
              Son dakika
            </Link>
            <Link href={newsItemDetailHref(breaking)} className="desktop-portal-breaking__story">
              <span className="min-w-0 flex-1 truncate">{breaking.title}</span>
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  )
}
