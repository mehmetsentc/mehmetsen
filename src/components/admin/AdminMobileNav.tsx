'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const links = [
  { href: ROUTES.ADMIN.DASHBOARD, label: 'Panel' },
  { href: ROUTES.ADMIN.NEWS, label: 'Haberler' },
  { href: ROUTES.ADMIN.USERS, label: 'Kullanıcılar' },
  { href: ROUTES.ADMIN.REPORTS, label: 'Raporlar' },
  { href: ROUTES.ADMIN.CATEGORIES, label: 'Kategoriler' },
]

export function AdminMobileNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 md:hidden hide-scrollbar">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
            pathname === href || pathname.startsWith(`${href}/`)
              ? 'bg-brand-600 text-white'
              : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
