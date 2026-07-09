'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getSiteNavItems } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const NAV = getSiteNavItems()

interface DesktopSiteNavLinksProps {
  variant: 'header' | 'footer'
  className?: string
}

function isActive(pathname: string, href: string, id: string): boolean {
  if (id === 'feed') return pathname === ROUTES.FEED
  if (href === ROUTES.REELS) return pathname.startsWith(ROUTES.REELS)
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function DesktopSiteNavLinks({ variant, className }: DesktopSiteNavLinksProps) {
  const pathname = usePathname()
  const isHeader = variant === 'header'

  if (isHeader) {
    return (
      <ul className={cn('flex min-w-max list-none items-stretch p-0 m-0', className)}>
        {NAV.map((item, index) => {
          const active = isActive(pathname, item.href, item.id)
          return (
            <li key={item.id} className="flex items-stretch">
              {index > 0 ? (
                <span className="my-3 w-px shrink-0 bg-[rgb(var(--color-border))]" aria-hidden />
              ) : null}
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={`${item.label} haberleri`}
                className={cn(
                  'shrink-0 py-3 text-[13px] transition-colors',
                  item.indent ? 'px-3 pl-5 text-[12px]' : 'px-4',
                  active
                    ? 'font-semibold text-[rgb(var(--color-text))]'
                    : 'font-medium text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}
              >
                <span className="relative inline-block whitespace-nowrap">
                  {item.label}
                  {active ? (
                    <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-[rgb(var(--color-text))]" />
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
    <ul className={cn('flex list-none flex-wrap gap-x-5 gap-y-2 p-0 m-0', className)}>
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, item.id)
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={`${item.label} haberleri`}
              className={cn(
                'text-sm transition-colors hover:text-[rgb(var(--color-text))] hover:underline',
                item.indent
                  ? 'pl-3 text-[rgb(var(--color-muted))]'
                  : item.id === 'feed'
                    ? 'font-semibold text-[rgb(var(--color-text))]'
                    : 'text-[rgb(var(--color-muted))]'
              )}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
