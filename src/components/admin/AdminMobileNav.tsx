'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const links = [
  { href: ROUTES.ADMIN.DASHBOARD, label: 'Panel', exact: true },
  { href: ROUTES.ADMIN.NEWS, label: 'Haberler' },
  { href: `${ROUTES.ADMIN.NEWS}?filter=pending`, label: 'Onay' },
  { href: ROUTES.ADMIN.INBOX, label: 'Gelen' },
  { href: ROUTES.ADMIN.NEWSROOM, label: 'AI' },
  { href: ROUTES.ADMIN.USERS, label: 'Ekip' },
]

export function AdminMobileNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 lg:hidden hide-scrollbar">
      {links.map(({ href, label, exact }) => {
        const path = href.split('?')[0]
        const active = exact
          ? pathname === path
          : pathname === path || pathname.startsWith(`${path}/`)
        return (
          <Link
            key={href + label}
            href={href}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
