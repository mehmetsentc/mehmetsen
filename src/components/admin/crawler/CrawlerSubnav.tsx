'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin/crawler', label: 'Özet', exact: true },
  { href: '/admin/crawler/discover', label: 'Kaynak Keşfi' },
  { href: '/admin/crawler/sources', label: 'Kaynaklar' },
  { href: '/admin/crawler/raw-articles', label: 'Ham Haberler' },
  { href: '/admin/crawler/clusters', label: 'Aynı Olay Haberleri' },
  { href: '/admin/crawler/queue', label: 'AI Öncesi Seçim' },
  { href: '/admin/crawler/ai-drafts', label: 'AI Taslakları' },
  { href: '/admin/crawler/ai-dispatch', label: 'Otomatik AI Yazımı' },
  { href: '/admin/crawler/ai-cost', label: 'AI Maliyeti' },
  { href: '/admin/crawler/failures', label: 'Hatalar' },
  { href: '/admin/crawler/health', label: 'Toplama Durumu' },
]

export function CrawlerSubnav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-2 max-lg:-mx-1 max-lg:overflow-x-auto max-lg:px-1 max-lg:pb-1 lg:flex-wrap [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium',
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
