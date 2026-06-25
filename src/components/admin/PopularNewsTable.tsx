'use client'

import Link from 'next/link'
import { ArrowRight, Eye, Newspaper } from 'lucide-react'
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { SafeNewsImage } from '@/components/news/SafeNewsImage'
import { ROUTES } from '@/constants/routes'
import { getCategoryLabel } from '@/lib/newsMapper'
import { formatCount } from '@/lib/postUtils'
import type { DashboardOverview } from '@/services/adminService'

interface PopularNewsTableProps {
  items: DashboardOverview['topNews']
  loading?: boolean
}

/**
 * PopularNewsTable — F4
 *
 * Mock'taki "En Popüler Haberler" tablosuna karşılık. View sayacına göre
 * sıralı, küçük thumbnail + başlık + kategori + görüntülenme.
 */
export function PopularNewsTable({ items, loading = false }: PopularNewsTableProps) {
  return (
    <Card surface="elevated" radius="2xl" className="overflow-hidden">
      <CardHeader>
        <CardTitle>En Popüler Haberler</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-border-subtle">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <span className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-bg-subtle" />
              <span className="h-4 flex-1 animate-pulse rounded bg-bg-subtle" />
            </li>
          ))
        ) : items.length === 0 ? (
          <li className="px-5 py-6 text-center text-sm text-text-tertiary">
            Henüz popüler haber yok
          </li>
        ) : (
          items.map((item, idx) => (
            <li key={item.id}>
              <Link
                href={ROUTES.NEWS_DETAIL(item.slug || item.id)}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-bg-subtle"
              >
                <span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-text-tertiary">
                  {idx + 1}
                </span>
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-bg-muted">
                  {item.coverImageUrl ? (
                    <SafeNewsImage
                      src={item.coverImageUrl}
                      alt={item.title}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-text-muted">
                      <Newspaper className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-2xs">
                    <Badge
                      variant="default"
                      size="sm"
                      className="bg-bg-subtle text-text-tertiary"
                    >
                      {getCategoryLabel(item.categoryId)}
                    </Badge>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-text-primary">
                    <Eye className="h-3.5 w-3.5 text-text-tertiary" />
                    {formatCount(item.viewsCount)}
                  </p>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
      <CardFooter>
        <Link
          href={ROUTES.ADMIN.NEWS}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-300"
        >
          Tüm haberler
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardFooter>
    </Card>
  )
}
