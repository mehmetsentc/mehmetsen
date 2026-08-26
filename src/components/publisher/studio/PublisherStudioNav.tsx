'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  DollarSign,
  FileText,
  LayoutGrid,
  Megaphone,
  Users,
  UserCircle,
} from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

const NAV = [
  { href: (slug: string) => ROUTES.PUBLISHER_STUDIO.PUBLISHER(slug), label: 'Genel Bakış', icon: LayoutGrid, active: true },
  { href: (slug: string) => ROUTES.PUBLISHER_STUDIO.PROFILE(slug), label: 'Profil', icon: UserCircle, active: true },
  { href: (slug: string) => ROUTES.PUBLISHER_STUDIO.LAYOUT(slug), label: 'Sayfa Düzeni', icon: LayoutGrid, active: true },
  { href: (slug: string) => ROUTES.PUBLISHER_STUDIO.ARTICLES(slug), label: 'Haberler', icon: FileText, active: true },
  { href: (slug: string) => ROUTES.PUBLISHER_STUDIO.TEAM(slug), label: 'Ekip', icon: Users, active: true },
  { href: (slug: string) => ROUTES.PUBLISHER_STUDIO.ANALYTICS(slug), label: 'Analitik', icon: BarChart3, active: false },
  { href: (slug: string) => ROUTES.PUBLISHER_STUDIO.ADS(slug), label: 'Reklamlar', icon: Megaphone, active: false },
  { href: (slug: string) => ROUTES.PUBLISHER_STUDIO.REVENUE(slug), label: 'Gelirler', icon: DollarSign, active: false },
] as const

export function PublisherStudioNav({
  slug,
  displayName,
}: {
  slug: string
  displayName: string
}) {
  const pathname = usePathname()

  return (
    <aside className="w-full shrink-0 lg:w-56">
      <div className="mb-4 px-1">
        <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          Publisher Studio
        </p>
        <p className="mt-1 truncate text-sm font-black text-[rgb(var(--color-text))]">{displayName}</p>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const href = item.href(slug)
          const isActive = pathname === href || pathname.startsWith(`${href}/`)
          if (!item.active) {
            return (
              <span
                key={item.label}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[rgb(var(--color-muted))] opacity-60"
                title="Yakında"
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
                <span className="ml-auto text-[10px] font-bold uppercase">Yakında</span>
              </span>
            )
          }
          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
                  : 'text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
