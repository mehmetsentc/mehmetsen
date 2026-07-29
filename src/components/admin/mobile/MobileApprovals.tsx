'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { db } from '@/lib/firebase/firestore'
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { getCategoryLabel } from '@/lib/newsMapper'
import { useMobileAdmin } from './MobileAdminContext'
import { cn } from '@/lib/utils'

function tsToMs(val: unknown): number {
  if (typeof val === 'number') return val
  if (val && typeof val === 'object' && 'toMillis' in val) return (val as { toMillis(): number }).toMillis()
  if (val && typeof val === 'object' && 'seconds' in val) return (val as { seconds: number }).seconds * 1000
  return 0
}

interface ApprovalItem {
  id: string
  title: string
  source: string
  categoryId: string
  createdAt: number
  image?: string
  confidenceScore?: number
  isBreaking?: boolean
}

type Chip = 'all' | 'breaking' | 'ai'

export function MobileApprovals() {
  const { setPendingBadge } = useMobileAdmin()
  const [items, setItems] = useState<ApprovalItem[]>([])
  const [chip, setChip] = useState<Chip>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'newsDrafts'),
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(40)
    )
    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            title: (data.title as string) ?? '',
            source: (data.source as string) ?? '',
            categoryId: (data.categoryId as string) ?? '',
            createdAt: tsToMs(data.createdAt),
            image: (data.imageUrl as string) || (data.thumbnail as string) || (data.coverImageUrl as string) || '',
            confidenceScore: data.confidenceScore as number | undefined,
            isBreaking: Boolean(data.isBreaking) || data.categoryId === 'son-dakika',
          }
        })
        setItems(next)
        setPendingBadge(snap.size)
        setLoading(false)
      },
      () => {
        setItems([])
        setLoading(false)
      }
    )
  }, [setPendingBadge])

  const filtered = items.filter((item) => {
    if (chip === 'breaking') return item.isBreaking
    if (chip === 'ai') return typeof item.confidenceScore === 'number' || /ai|pipeline|newsroom/i.test(item.source)
    return true
  })

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[rgb(var(--color-text))]">Onay Kuyruğu</h1>
          <p className="text-sm text-[rgb(var(--color-muted))]">{items.length} bekleyen</p>
        </div>
        {items.length > 0 ? (
          <Link
            href={`/admin/approvals/${items[0].id}?source=newsDrafts&mode=rapid`}
            className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white"
          >
            Hızlı Onay
          </Link>
        ) : null}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
        {(
          [
            { id: 'all', label: 'Tümü' },
            { id: 'breaking', label: 'Son Dakika' },
            { id: 'ai', label: 'AI' },
          ] as const
        ).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChip(c.id)}
            className={cn(
              'shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold',
              chip === c.id
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--color-border))]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[rgb(var(--color-border))] px-4 py-14 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-semibold text-[rgb(var(--color-text))]">Onay bekleyen haber bulunmuyor.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/admin/approvals/${item.id}?source=newsDrafts`}
              className="block overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] active:opacity-95"
            >
              <div className="relative aspect-[16/9] bg-[rgb(var(--color-surface))]">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" className="h-full w-full object-cover" />
                ) : null}
                {item.isBreaking ? (
                  <span className="absolute left-3 top-3 rounded-md bg-[rgb(var(--color-brand))] px-2 py-1 text-[10px] font-bold uppercase text-white">
                    Son Dakika
                  </span>
                ) : null}
              </div>
              <div className="p-3.5">
                <p className="line-clamp-3 text-[17px] font-bold leading-snug text-[rgb(var(--color-text))]">
                  {item.title}
                </p>
                <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">
                  {item.source || 'Kaynak yok'} · {getCategoryLabel(item.categoryId)}
                  {item.createdAt
                    ? ` · ${formatDistanceToNow(new Date(item.createdAt), { locale: tr, addSuffix: true })}`
                    : ''}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-2 text-[10px] font-semibold text-[rgb(var(--color-muted))]">
                    {typeof item.confidenceScore === 'number' ? <span>AI {item.confidenceScore}</span> : null}
                    <span>İncele →</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
