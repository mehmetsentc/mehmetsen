'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Category {
  label: string
  href: string
  match: (pathname: string) => boolean
}

const CATEGORIES: Category[] = [
  {
    label: 'Gündem',
    href: '/feed',
    match: (p) => p === '/feed' || p === '/',
  },
  {
    label: 'Son Dakika',
    href: '/kategori/son-dakika',
    match: (p) => p === '/kategori/son-dakika',
  },
  {
    label: 'Siyaset',
    href: '/kategori/siyaset',
    match: (p) => p === '/kategori/siyaset',
  },
  {
    label: 'Ekonomi',
    href: '/kategori/ekonomi',
    match: (p) => p === '/kategori/ekonomi',
  },
  {
    label: 'Spor',
    href: '/kategori/spor',
    match: (p) => p === '/kategori/spor',
  },
  {
    label: 'Dünya',
    href: '/kategori/dunya',
    match: (p) => p === '/kategori/dunya',
  },
  {
    label: 'Teknoloji',
    href: '/kategori/teknoloji',
    match: (p) => p === '/kategori/teknoloji',
  },
  {
    label: 'Sağlık',
    href: '/kategori/saglik',
    match: (p) => p === '/kategori/saglik',
  },
  {
    label: 'Magazin',
    href: '/kategori/magazin',
    match: (p) => p === '/kategori/magazin',
  },
  {
    label: 'Kültür',
    href: '/kategori/kultur',
    match: (p) => p === '/kategori/kultur',
  },
  {
    label: 'Bilim',
    href: '/kategori/bilim',
    match: (p) => p === '/kategori/bilim',
  },
  {
    label: 'Yerel',
    href: '/local',
    match: (p) => p === '/local',
  },
]

export function CategoryNav() {
  const pathname = usePathname()

  // Reels, messages, admin, news detail gibi sayfalarda gösterme
  const hide =
    pathname === '/reels' ||
    pathname.startsWith('/messages') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/news/') ||
    pathname.startsWith('/post/') ||
    pathname.startsWith('/profile/')

  if (hide) return null

  return (
    <nav
      className="sticky top-14 z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] lg:hidden"
      aria-label="Kategoriler"
    >
      <div className="flex gap-0 overflow-x-auto scrollbar-none">
        {CATEGORIES.map((cat) => {
          const isActive = cat.match(pathname)
          return (
            <Link
              key={cat.href}
              href={cat.href}
              className={cn(
                'relative shrink-0 px-4 py-2.5 text-[13px] font-semibold transition-colors',
                isActive
                  ? 'text-[rgb(var(--color-brand))]'
                  : 'text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
              )}
            >
              {cat.label}
              {isActive && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[rgb(var(--color-brand))]" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
