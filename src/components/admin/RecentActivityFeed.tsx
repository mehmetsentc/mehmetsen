'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { CheckCircle2, Clock, FileText } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { cn } from '@/lib/utils'
import type { DashboardOverview } from '@/services/adminService'

interface RecentActivityFeedProps {
  items: DashboardOverview['recentActivity']
  loading?: boolean
}

/**
 * RecentActivityFeed — F4
 *
 * Mock'taki "Son Aktiviteler" alanına karşılık. En son eklenen haberleri
 * (publish / pending durumlarıyla) timeline tarzı gösterir.
 */
export function RecentActivityFeed({ items, loading = false }: RecentActivityFeedProps) {
  return (
    <Card surface="elevated" radius="2xl" className="overflow-hidden">
      <CardHeader>
        <CardTitle>Son Aktiviteler</CardTitle>
      </CardHeader>
      <ul className="max-h-[420px] divide-y divide-border-subtle overflow-y-auto">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-bg-subtle" />
              <span className="h-4 flex-1 animate-pulse rounded bg-bg-subtle" />
            </li>
          ))
        ) : items.length === 0 ? (
          <li className="px-5 py-6 text-center text-sm text-text-tertiary">
            Henüz aktivite yok
          </li>
        ) : (
          items.map((item) => {
            const pending = item.type === 'pending'
            const Icon = pending ? Clock : CheckCircle2
            const colorCls = pending ? 'text-warning' : 'text-success'
            const bgCls = pending ? 'bg-warning/10' : 'bg-success/10'
            return (
              <li key={item.id}>
                <Link
                  href={ROUTES.NEWS_DETAIL(item.id)}
                  className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-bg-subtle"
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      bgCls,
                      colorCls
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-text-primary">
                      <FileText className="mr-1 inline-block h-3 w-3 text-text-tertiary" />
                      {pending ? 'İncelemede:' : 'Yayında:'} {item.title}
                    </p>
                    <p className="mt-0.5 text-2xs text-text-tertiary">
                      {getCategoryLabel(item.category)}
                      <span aria-hidden> · </span>
                      <time dateTime={item.when}>
                        {formatRelative(item.when)}
                      </time>
                    </p>
                  </div>
                </Link>
              </li>
            )
          })
        )}
      </ul>
    </Card>
  )
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr })
  } catch {
    return ''
  }
}
