'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  AdminOsEmptyState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { auth } from '@/lib/firebase/auth'
import { Collections, db } from '@/lib/firebase/firestore'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { getCategoryLabel } from '@/lib/newsMapper'

function tsToMs(val: unknown): number {
  if (typeof val === 'number') return val
  if (val && typeof val === 'object' && 'toMillis' in val) return (val as { toMillis(): number }).toMillis()
  if (val && typeof val === 'object' && 'seconds' in val) return (val as { seconds: number }).seconds * 1000
  return 0
}

type LiveRow = {
  id: string
  title: string
  categoryId: string
  source: string
  city?: string
  kind: 'pending' | 'published' | 'breaking'
  createdAt: number
  href: string
}

export default function LiveCenterPage() {
  const [rows, setRows] = useState<LiveRow[]>([])
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    let published: LiveRow[] = []
    let pending: LiveRow[] = []
    let breaking: LiveRow[] = []
    const merge = () => {
      setRows([...pending, ...breaking, ...published].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40))
      setPendingCount(pending.length)
    }

    const u1 = onSnapshot(
      query(collection(db, Collections.NEWS), orderBy('createdAt', 'desc'), limit(15)),
      (snap) => {
        published = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: `p-${d.id}`,
            title: (data.title as string) ?? '',
            categoryId: (data.categoryId as string) ?? '',
            source: (data.source as string) ?? '',
            city: (data.citySlug as string) || (data.city as string) || undefined,
            kind: 'published' as const,
            createdAt: tsToMs(data.createdAt),
            href: `/admin/news/${d.id}/edit`,
          }
        })
        merge()
      },
      () => {}
    )
    const u2 = onSnapshot(
      query(
        collection(db, 'newsDrafts'),
        where('draftStatus', '==', 'pending_review'),
        orderBy('createdAt', 'desc'),
        limit(15)
      ),
      (snap) => {
        pending = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: `d-${d.id}`,
            title: (data.title as string) ?? '',
            categoryId: (data.categoryId as string) ?? '',
            source: (data.source as string) ?? '',
            kind: 'pending' as const,
            createdAt: tsToMs(data.createdAt),
            href: '/admin/approvals',
          }
        })
        merge()
      },
      () => {}
    )
    const u3 = onSnapshot(
      query(
        collection(db, Collections.NEWS),
        where('isBreaking', '==', true),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(10)
      ),
      (snap) => {
        breaking = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: `b-${d.id}`,
            title: (data.title as string) ?? '',
            categoryId: (data.categoryId as string) ?? '',
            source: (data.source as string) ?? '',
            city: (data.citySlug as string) || undefined,
            kind: 'breaking' as const,
            createdAt: tsToMs(data.createdAt),
            href: `/admin/news/${d.id}/edit`,
          }
        })
        merge()
      },
      () => {}
    )
    return () => {
      u1()
      u2()
      u3()
    }
  }, [])

  return (
    <AdminOsPageShell
      title="Canlı Haber Merkezi"
      subtitle="Kaynak · şehir · kategori · durum — anlık Firestore dinleme"
      actions={
        <Link href="/admin/approvals" className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white">
          Onay kuyruğu
        </Link>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Canlı satır', value: String(rows.length), tone: 'ok' },
          { label: 'Onay bekleyen', value: String(pendingCount), tone: pendingCount ? 'warn' : 'default' },
          { label: 'Son dakika', value: String(rows.filter((r) => r.kind === 'breaking').length) },
          { label: 'Kaynak', value: 'Firestore live' },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        {rows.length === 0 ? (
          <AdminOsEmptyState
            title="Şu an canlı sinyal yok"
            description="Yeni yayın veya onay bekleyen haber geldiğinde burada anlık görünür."
            href="/admin/news"
            hrefLabel="Haberlere git"
          />
        ) : (
          <div className="divide-y divide-[rgb(var(--color-border))]">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={r.href}
                className="flex items-start gap-3 px-4 py-3 hover:bg-[rgb(var(--color-surface))]"
              >
                <span className="mt-0.5 w-12 shrink-0 text-[11px] font-semibold tabular-nums text-[rgb(var(--color-muted))]">
                  {r.createdAt ? format(new Date(r.createdAt), 'HH:mm') : '—'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    <AdminStatusBadge
                      status={
                        r.kind === 'breaking' ? 'breaking' : r.kind === 'pending' ? 'pending_review' : 'published'
                      }
                    />
                    <span className="admin-meta">{getCategoryLabel(r.categoryId)}</span>
                    {r.city ? <span className="admin-meta">{r.city}</span> : null}
                    {r.source ? <span className="admin-meta">{r.source}</span> : null}
                  </div>
                  <p className="line-clamp-2 text-sm font-semibold text-[rgb(var(--color-text))]">{r.title}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminOsPageShell>
  )
}
