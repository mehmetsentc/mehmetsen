'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Newspaper,
  Tags,
  Users,
  Flag,
  CalendarDays,
  Archive,
  Settings,
  ArrowLeft,
  Inbox,
} from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'

const navItems = [
  { href: ROUTES.ADMIN.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  { href: ROUTES.ADMIN.NEWS, label: 'Haberler', icon: Newspaper },
  { href: ROUTES.ADMIN.CATEGORIES, label: 'Kategoriler', icon: Tags },
  { href: ROUTES.ADMIN.USERS, label: 'Kullanıcılar', icon: Users },
  { href: ROUTES.ADMIN.SUBMISSIONS, label: 'Okuyucu Haberleri', icon: Inbox },
  { href: ROUTES.ADMIN.REPORTS, label: 'Raporlar', icon: Flag },
  { href: ROUTES.ADMIN.EVENTS, label: 'Etkinlikler', icon: CalendarDays },
  { href: ROUTES.ADMIN.ARCHIVE, label: 'Arşiv', icon: Archive },
  { href: ROUTES.ADMIN.SETTINGS, label: 'Ayarlar', icon: Settings },
]

function isActive(pathname: string, href: string): boolean {
  if (href === ROUTES.ADMIN.DASHBOARD) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[rgb(var(--color-border))] bg-[#0f172a] text-white">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
        <BrandLogo size="sm" className="h-8 w-8" />
        <div>
          <p className="text-sm font-bold tracking-wide">NaHaber</p>
          <p className="text-[10px] uppercase tracking-widest text-white/50">Admin Panel</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-600 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href={ROUTES.FEED}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Uygulamaya Dön
        </Link>
      </div>
    </aside>
  )
}
