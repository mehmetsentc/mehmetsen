'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin/social/overview', label: 'Genel Bakış' },
  { href: '/admin/social/accounts', label: 'Hesaplar' },
  { href: '/admin/social/automation', label: 'Otomasyon' },
  { href: '/admin/social/shares', label: 'Paylaşımlar' },
  { href: '/admin/social/reels', label: 'Reels' },
  { href: '/admin/social/network', label: 'İl Ağı' },
  { href: '/admin/social/places', label: 'Konumlar' },
] as const

/** Sosyal medya yönetimi sekmeleri (merkez / il yöneticisi). */
export function SocialAdminNav() {
  const path = usePathname()
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-[rgb(var(--color-border))]" aria-label="Sosyal medya yönetimi">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={path === t.href ? 'page' : undefined}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold',
            path === t.href ? 'border-blue-600 text-[rgb(var(--color-text))]' : 'border-transparent text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]',
          )}
        >
          {t.label}
        </Link>
      ))}
      <Link href="/admin/social" className="ml-auto whitespace-nowrap px-3 py-2 text-xs text-[rgb(var(--color-muted))] underline">
        Haber paylaşım masası
      </Link>
    </nav>
  )
}
