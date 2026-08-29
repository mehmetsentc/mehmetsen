'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  getHeaderAllNavItems,
  getHeaderPrimaryNavItems,
  getHeaderSecondaryNavItems,
  getSiteNavItems,
} from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const NAV = getSiteNavItems()
const PRIMARY = getHeaderPrimaryNavItems()
const SECONDARY = getHeaderSecondaryNavItems()
const ALL = getHeaderAllNavItems()
const FOOTER_PRIMARY = NAV.filter((item) => !item.indent && item.id !== 'teve')
const FOOTER_GROUPED = NAV.filter((item) => item.indent)

interface DesktopSiteNavLinksProps {
  variant: 'header' | 'footer' | 'header-primary' | 'header-secondary' | 'header-all'
  /** masthead: NYT tarzı ortalanmış, ayırıcısız nav (legacy) */
  layout?: 'default' | 'masthead'
  className?: string
}

function isActive(pathname: string, href: string, id: string): boolean {
  if (id === 'feed') return pathname === ROUTES.FEED
  if (id === 'feed-v2') return pathname === ROUTES.FEED_V2 || pathname.startsWith(`${ROUTES.FEED_V2}/`)
  if (id === 'yerel') return pathname === ROUTES.LOCAL || pathname.startsWith(`${ROUTES.LOCAL}/`)
  if (id === 'video' || href === ROUTES.REELS) return pathname.startsWith(ROUTES.REELS)
  return pathname === href || pathname.startsWith(`${href}/`)
}

function FooterNavLink({
  item,
  active,
}: {
  item: (typeof NAV)[number]
  active: boolean
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={`${item.label} haberleri`}
      className={cn(
        'whitespace-nowrap text-sm transition-colors hover:text-[rgb(var(--color-text))] hover:underline',
        item.id === 'feed'
          ? 'font-semibold text-[rgb(var(--color-text))]'
          : active
            ? 'font-semibold text-[rgb(var(--color-text))]'
            : 'text-[rgb(var(--color-muted))]'
      )}
    >
      {item.label}
    </Link>
  )
}

function HeaderNavList({
  items,
  tone,
  className,
}: {
  items: typeof PRIMARY
  tone: 'onBrand' | 'onNavy'
  className?: string
}) {
  const pathname = usePathname()
  const isPrimary = tone === 'onBrand'

  return (
    <ul
      className={cn(
        'flex min-w-max list-none items-stretch p-0 m-0',
        className
      )}
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href, item.id)
        return (
          <li key={item.id} className="flex items-stretch">
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={`${item.label} haberleri`}
              className={cn(
                'shrink-0 transition-colors',
                isPrimary
                  ? 'px-2.5 py-3 text-[12px] font-bold uppercase tracking-wide xl:px-3'
                  : 'px-3 py-2.5 text-[13px] font-semibold xl:px-4',
                active
                  ? 'text-white'
                  : 'text-white/85 hover:text-white'
              )}
            >
              <span className="relative inline-block whitespace-nowrap">
                {item.label}
                {active ? (
                  <span
                    className={cn(
                      'absolute left-0 right-0 bg-white',
                      isPrimary ? '-bottom-2.5 h-0.5' : '-bottom-2 h-[2px]'
                    )}
                  />
                ) : null}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function DesktopSiteNavLinks({
  variant,
  layout = 'default',
  className,
}: DesktopSiteNavLinksProps) {
  const pathname = usePathname()

  if (variant === 'header-primary') {
    return <HeaderNavList items={PRIMARY} tone="onBrand" className={className} />
  }

  if (variant === 'header-secondary') {
    return <HeaderNavList items={SECONDARY} tone="onNavy" className={className} />
  }

  if (variant === 'header-all') {
    return <HeaderNavList items={ALL} tone="onNavy" className={className} />
  }

  if (variant === 'header') {
    const isMasthead = layout === 'masthead'
    return (
      <ul
        className={cn(
          'flex min-w-max list-none items-stretch p-0 m-0',
          isMasthead ? 'justify-start gap-0' : '',
          className
        )}
      >
        {NAV.map((item, index) => {
          const active = isActive(pathname, item.href, item.id)
          return (
            <li key={item.id} className="flex items-stretch">
              {!isMasthead && index > 0 ? (
                <span className="my-3 w-px shrink-0 bg-[rgb(var(--color-border))]" aria-hidden />
              ) : null}
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={`${item.label} haberleri`}
                className={cn(
                  'shrink-0 transition-colors',
                  isMasthead
                    ? 'px-3 py-3 text-[13px] font-medium'
                    : 'py-3 text-[13px]',
                  !isMasthead && (item.indent ? 'px-3 pl-5 text-[12px]' : 'px-4'),
                  active
                    ? 'font-semibold text-[rgb(var(--color-text))]'
                    : isMasthead
                      ? 'text-[rgb(var(--color-text))]/80 hover:text-[rgb(var(--color-text))]'
                      : 'font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}
              >
                <span className="relative inline-block whitespace-nowrap">
                  {item.label}
                  {active ? (
                    <span
                      className={cn(
                        'absolute left-0 right-0 h-0.5 bg-[rgb(var(--color-text))]',
                        isMasthead ? '-bottom-3' : '-bottom-3'
                      )}
                    />
                  ) : null}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className={cn('w-full space-y-4', className)}>
      <ul
        className="flex list-none flex-wrap items-center gap-x-5 gap-y-2 p-0 m-0 xl:flex-nowrap xl:gap-x-6"
        aria-label="Ana kategoriler"
      >
        {FOOTER_PRIMARY.map((item) => {
          const active = isActive(pathname, item.href, item.id)
          return (
            <li key={item.id} className="shrink-0">
              <FooterNavLink item={item} active={active} />
            </li>
          )
        })}
      </ul>

      {FOOTER_GROUPED.length > 0 ? (
        <div className="border-t border-[rgb(var(--color-border))] pt-4">
          <p className="mb-2.5 text-[10px] font-black uppercase tracking-widest text-[rgb(var(--color-muted))]">
            Kültür & Medya
          </p>
          <ul className="flex list-none flex-wrap items-center gap-x-5 gap-y-2 p-0 m-0">
            {FOOTER_GROUPED.map((item) => {
              const active = isActive(pathname, item.href, item.id)
              return (
                <li key={item.id} className="shrink-0">
                  <FooterNavLink item={item} active={active} />
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
