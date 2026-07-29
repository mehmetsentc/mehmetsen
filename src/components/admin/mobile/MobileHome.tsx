'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Clock, Zap, Plus, Bot, Image as ImageIcon, ChevronRight,
  CheckCircle2, Radio,
} from 'lucide-react'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { useMobileAdmin } from './MobileAdminContext'
import { db, Collections } from '@/lib/firebase/firestore'
import {
  collection, query, where, orderBy, limit, onSnapshot, getCountFromServer,
} from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { getCategoryLabel } from '@/lib/newsMapper'
import { cn } from '@/lib/utils'

function tsToMs(val: unknown): number {
  if (typeof val === 'number') return val
  if (val && typeof val === 'object' && 'toMillis' in val) return (val as { toMillis(): number }).toMillis()
  if (val && typeof val === 'object' && 'seconds' in val) return (val as { seconds: number }).seconds * 1000
  return 0
}

interface FeedItem {
  id: string
  title: string
  source: string
  categoryId: string
  createdAt: number
  image?: string
  href: string
  kind: 'pending' | 'published'
}

export function MobileHome() {
  const { user, roleLabel, can } = useCmsAuth()
  const { openCreate, setPendingBadge } = useMobileAdmin()
  const [pendingCount, setPendingCount] = useState(0)
  const [breakingCount, setBreakingCount] = useState(0)
  const [incoming, setIncoming] = useState<FeedItem[]>([])
  const [published, setPublished] = useState<FeedItem[]>([])

  const refreshCounts = useCallback(async () => {
    try {
      const [pendingSnap, breakingSnap] = await Promise.all([
        getCountFromServer(query(collection(db, 'newsDrafts'), where('draftStatus', '==', 'pending_review'))).catch(() => null),
        getCountFromServer(
          query(collection(db, Collections.NEWS), where('isBreaking', '==', true), where('status', '==', 'published'))
        ).catch(() => null),
      ])
      const p = pendingSnap?.data().count ?? 0
      setPendingCount(p)
      setPendingBadge(p)
      setBreakingCount(breakingSnap?.data().count ?? 0)
    } catch {
      /* ignore */
    }
  }, [setPendingBadge])

  useEffect(() => {
    void refreshCounts()
    const id = window.setInterval(() => void refreshCounts(), 120_000)
    return () => window.clearInterval(id)
  }, [refreshCounts])

  useEffect(() => {
    const q = query(
      collection(db, 'newsDrafts'),
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(5)
    )
    return onSnapshot(
      q,
      (snap) => {
        setIncoming(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              title: (data.title as string) ?? '',
              source: (data.source as string) ?? '',
              categoryId: (data.categoryId as string) ?? '',
              createdAt: tsToMs(data.createdAt),
              image: (data.imageUrl as string) || (data.thumbnail as string) || '',
              href: `/admin/approvals/${d.id}?source=newsDrafts`,
              kind: 'pending' as const,
            }
          })
        )
        setPendingCount(snap.size >= 5 ? Math.max(pendingCount, 5) : snap.size)
        if (snap.size < 5) setPendingBadge(snap.size)
      },
      () => setIncoming([])
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPendingBadge])

  useEffect(() => {
    const q = query(
      collection(db, Collections.NEWS),
      where('status', '==', 'published'),
      orderBy('createdAt', 'desc'),
      limit(5)
    )
    return onSnapshot(
      q,
      (snap) => {
        setPublished(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              title: (data.title as string) ?? '',
              source: (data.source as string) ?? '',
              categoryId: (data.categoryId as string) ?? '',
              createdAt: tsToMs(data.createdAt),
              image: (data.imageUrl as string) || (data.coverImageUrl as string) || '',
              href: `/admin/news/${d.id}/edit`,
              kind: 'published' as const,
            }
          })
        )
      },
      () => setPublished([])
    )
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'
  const firstName = user?.displayName?.split(' ')[0] ?? 'Editör'
  const today = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-5 px-4 py-4">
      <section>
        <p className="text-xl font-bold tracking-tight text-[rgb(var(--color-text))]">
          {greeting}, {firstName}
        </p>
        <p className="mt-0.5 text-sm capitalize text-[rgb(var(--color-muted))]">
          {roleLabel} · {today}
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          <Radio className="h-3 w-3" />
          Canlı yayın aktif
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
            Dikkatinizi bekleyenler
          </h2>
        </div>
        <div className="divide-y divide-[rgb(var(--color-border))]">
          <AttentionRow
            href="/admin/approvals"
            icon={<Clock className="h-4 w-4" />}
            tone="warning"
            title={`${pendingCount} onay bekliyor`}
          />
          {breakingCount > 0 ? (
            <AttentionRow
              href="/admin/news?category=son-dakika"
              icon={<Zap className="h-4 w-4" />}
              tone="danger"
              title={`${breakingCount} aktif son dakika`}
            />
          ) : null}
          {pendingCount === 0 && breakingCount === 0 ? (
            <div className="flex items-center gap-2 px-4 py-5 text-sm text-[rgb(var(--color-muted))]">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Şu an kritik bekleyen yok.
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-0.5 text-[13px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
          Hızlı işlemler
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {can('news:create') ? (
            <QuickBtn onClick={openCreate} icon={<Plus className="h-4 w-4" />} label="Yeni Haber" />
          ) : null}
          {can('news:create') ? (
            <QuickBtn href="/admin/quick?mode=breaking" icon={<Zap className="h-4 w-4" />} label="Son Dakika" accent />
          ) : null}
          {can('ai:use') ? (
            <QuickBtn href="/admin/ai/news" icon={<Bot className="h-4 w-4" />} label="AI Taslak" />
          ) : null}
          {can('news:edit') ? (
            <QuickBtn href="/admin/news/create" icon={<ImageIcon className="h-4 w-4" />} label="Fotoğraflı Haber" />
          ) : null}
        </div>
      </section>

      <FeedSection title="Son gelenler" items={incoming} empty="Onay bekleyen haber yok." />
      <FeedSection title="Son yayınlananlar" items={published} empty="Yayınlanmış haber yok." />
    </div>
  )
}

function AttentionRow({
  href,
  icon,
  title,
  tone,
}: {
  href: string
  icon: React.ReactNode
  title: string
  tone: 'warning' | 'danger'
}) {
  return (
    <Link href={href} className="flex min-h-12 items-center gap-3 px-4 py-3 active:bg-[rgb(var(--color-surface))]">
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl',
          tone === 'danger' ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-600'
        )}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm font-semibold text-[rgb(var(--color-text))]">{title}</span>
      <ChevronRight className="h-4 w-4 text-[rgb(var(--color-muted))]" />
    </Link>
  )
}

function QuickBtn({
  href,
  onClick,
  icon,
  label,
  accent,
}: {
  href?: string
  onClick?: () => void
  icon: React.ReactNode
  label: string
  accent?: boolean
}) {
  const cls = cn(
    'flex min-h-12 items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold',
    accent
      ? 'border-[rgb(var(--color-brand))]/30 bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]'
      : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]'
  )
  if (href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  )
}

function FeedSection({ title, items, empty }: { title: string; items: FeedItem[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-2 px-0.5 text-[13px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">{empty}</p>
        ) : (
          <div className="divide-y divide-[rgb(var(--color-border))]">
            {items.map((item) => (
              <Link key={item.id} href={item.href} className="flex gap-3 px-3 py-3 active:bg-[rgb(var(--color-surface))]">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[rgb(var(--color-surface))]">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  {item.kind === 'pending' ? (
                    <span className="text-[10px] font-bold uppercase text-amber-600">Onay bekliyor</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-emerald-600">Yayında</span>
                  )}
                  <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--color-text))]">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">
                    {getCategoryLabel(item.categoryId)}
                    {item.source ? ` · ${item.source}` : ''}
                    {item.createdAt
                      ? ` · ${formatDistanceToNow(new Date(item.createdAt), { locale: tr, addSuffix: true })}`
                      : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
