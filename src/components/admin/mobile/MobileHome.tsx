'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Clock, Zap, Plus, Bot, ChevronRight,
  CheckCircle2, Clapperboard,
} from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { useMobileAdmin } from './MobileAdminContext'
import { db, Collections } from '@/lib/firebase/firestore'
import {
  collection, query, where, orderBy, limit, onSnapshot, getCountFromServer, Timestamp,
} from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { getCategoryLabel } from '@/lib/newsMapper'
import { cn } from '@/lib/utils'
import { countVisiblePendingApprovals, isDuplicateNewsData } from '@/services/adminNewsService'

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
  const { setPendingBadge } = useMobileAdmin()
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [breakingCount, setBreakingCount] = useState<number | null>(null)
  const [todayCount, setTodayCount] = useState<number | null>(null)
  const [uncertainCount, setUncertainCount] = useState<number | null>(null)
  const [incoming, setIncoming] = useState<FeedItem[]>([])
  const [published, setPublished] = useState<FeedItem[]>([])

  const refreshCounts = useCallback(async () => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    // orderBy desc so the count uses the existing (status ↑, createdAt ↓) index.
    const [pending, breakingSnap, todaySnap] = await Promise.all([
      countVisiblePendingApprovals().catch(() => null),
      getCountFromServer(
        query(collection(db, Collections.NEWS), where('isBreaking', '==', true), where('status', '==', 'published'))
      ).catch(() => null),
      getCountFromServer(
        query(collection(db, Collections.NEWS), where('status', '==', 'published'), where('createdAt', '>=', Timestamp.fromDate(start)), orderBy('createdAt', 'desc'))
      ).catch(() => null),
    ])
    if (pending != null) {
      setPendingCount(pending)
      setPendingBadge(pending)
    }
    setBreakingCount(breakingSnap ? breakingSnap.data().count : null)
    setTodayCount(todaySnap ? todaySnap.data().count : null)
  }, [setPendingBadge])

  useEffect(() => {
    void refreshCounts()
    const id = window.setInterval(() => void refreshCounts(), 120_000)
    return () => window.clearInterval(id)
  }, [refreshCounts])

  // Shares whose platform result is unknown (central managers only; read once, never polled).
  const isManager = can('system:settings')
  useEffect(() => {
    if (!isManager) return
    let alive = true
    void (async () => {
      try {
        const token = (await auth.currentUser?.getIdToken()) ?? ''
        if (!token) return
        const res = await fetch('/api/admin/social/publish-records', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = (await res.json().catch(() => null)) as { records?: unknown[] } | null
        if (alive && Array.isArray(data?.records)) setUncertainCount(data!.records!.length)
      } catch {
        // not a manager / offline
      }
    })()
    return () => {
      alive = false
    }
  }, [isManager])

  useEffect(() => {
    const q = query(
      collection(db, 'newsDrafts'),
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(3)
    )
    return onSnapshot(
      q,
      (snap) => {
        setIncoming(
          snap.docs
            .filter((d) => !isDuplicateNewsData(d.data()))
            .map((d) => {
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
      },
      () => setIncoming([])
    )
  }, [])

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
  const pending = pendingCount ?? 0
  const uncertain = uncertainCount ?? 0
  const breaking = breakingCount ?? 0
  const allClear = pendingCount != null && pending === 0 && uncertain === 0

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4">
      <section>
        <p className="text-xl font-bold tracking-tight text-[rgb(var(--color-text))]">
          {greeting}, {firstName}
        </p>
        <p className="mt-0.5 text-sm capitalize text-[rgb(var(--color-muted))]">
          {roleLabel} · {today}
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        <div className="border-b border-[rgb(var(--color-border))] px-4 py-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Dikkat</h2>
        </div>
        <div className="divide-y divide-[rgb(var(--color-border))]">
          {pending > 0 ? (
            <AttentionRow href="/admin/news?filter=pending" icon={<Clock className="h-4 w-4" />} tone="warning" title={`${pending} haber onay bekliyor`} />
          ) : null}
          {uncertain > 0 ? (
            <AttentionRow href="/admin/social/shares" icon={<AlertTriangle className="h-4 w-4" />} tone="danger" title={`${uncertain} paylaşımın sonucu belirsiz`} />
          ) : null}
          {allClear ? (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-[rgb(var(--color-muted))]">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Bekleyen iş yok.
            </div>
          ) : null}
          {pendingCount == null ? <div className="h-12 animate-pulse bg-[rgb(var(--color-surface))]" /> : null}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <StatTile href="/admin/news?filter=published" label="Bugün yayınlanan" value={todayCount} />
        <StatTile href="/admin/news?filter=breaking" label="Son dakika" value={breakingCount} accent={breaking > 0} />
        <StatTile href="/admin/news?filter=pending" label="Onay bekleyen" value={pendingCount} />
      </section>

      <section>
        <h2 className="mb-2 px-0.5 text-[13px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Kısayollar</h2>
        <div className="grid grid-cols-2 gap-2">
          {can('news:create') ? (
            <QuickBtn href="/admin/news/create" icon={<Plus className="h-4 w-4" />} label="Hızlı haber" />
          ) : null}
          {can('news:create') ? (
            <QuickBtn href="/admin/news/create?mode=breaking" icon={<Zap className="h-4 w-4" />} label="Son dakika" accent />
          ) : null}
          {can('ai:use') ? <QuickBtn href="/admin/ai/news" icon={<Bot className="h-4 w-4" />} label="AI ile taslak" /> : null}
          {can('video:read') ? (
            <QuickBtn href="/admin/media-studio/reels" icon={<Clapperboard className="h-4 w-4" />} label="Reels" />
          ) : null}
        </div>
      </section>

      {pending > 0 && incoming.length > 0 ? (
        <FeedSection title="Onay bekleyenler" items={incoming} more={{ href: '/admin/news?filter=pending', label: 'Tümü' }} />
      ) : null}
      <FeedSection title="Son yayınlananlar" items={published} empty="Yayınlanmış haber yok." more={{ href: '/admin/news?filter=published', label: 'Tümü' }} />
    </div>
  )
}

function StatTile({ href, label, value, accent }: { href: string; label: string; value: number | null; accent?: boolean }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-3 active:bg-[rgb(var(--color-surface))]"
    >
      <p className={cn('text-2xl font-extrabold tabular-nums', accent ? 'text-[rgb(var(--color-brand))]' : 'text-[rgb(var(--color-text))]')}>
        {value == null ? '—' : value}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold leading-tight text-[rgb(var(--color-muted))]">{label}</p>
    </Link>
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

function FeedSection({ title, items, empty, more }: { title: string; items: FeedItem[]; empty?: string; more?: { href: string; label: string } }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{title}</h2>
        {more ? (
          <Link href={more.href} className="text-xs font-semibold text-[rgb(var(--color-brand))]">
            {more.label}
          </Link>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">{empty ?? 'Kayıt yok.'}</p>
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
