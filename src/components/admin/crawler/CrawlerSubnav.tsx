'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin/crawler', label: 'Özet', exact: true },
  { href: '/admin/crawler/discover', label: 'Kaynak Keşfi' },
  { href: '/admin/crawler/sources', label: 'Kaynaklar' },
  { href: '/admin/crawler/raw-articles', label: 'Ham Haberler' },
  { href: '/admin/crawler/clusters', label: 'Olay Kümeleri' },
  { href: '/admin/crawler/queue', label: 'Ön-AI Kuyruk' },
  { href: '/admin/crawler/failures', label: 'Hatalar' },
  { href: '/admin/crawler/health', label: 'Crawler Sağlığı' },
]

export function CrawlerSubnav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              active
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
