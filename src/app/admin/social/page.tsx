'use client'

import { useEffect, useState, useCallback } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import {
  collection, query, where, orderBy, limit,
  getDocs, startAfter, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  Share2, CheckCircle2, XCircle, RefreshCw, Loader2,
  Facebook, Instagram, ExternalLink, Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

// ── Types ──────────────────────────────────────────────────────────────────
interface SocialNewsRow {
  id: string
  title: string
  category: string
  imageUrl?: string
  url?: string
  createdAt?: number
  socialPublished?: boolean
  socialPublishedAt?: number
  facebookPostId?: string
  instagramMediaId?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        ok
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function SocialPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<SocialNewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [triggeringCron, setTriggeringCron] = useState(false)
  const [filter, setFilter] = useState<'all' | 'published' | 'pending'>('all')

  const fetchRows = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true)
      else setLoadingMore(true)

      try {
        const col = collection(db, 'news')
        let q

        if (filter === 'published') {
          q = query(
            col,
            where('category', '==', 'canakkale'),
            where('socialPublished', '==', true),
            orderBy('socialPublishedAt', 'desc'),
            limit(PAGE_SIZE),
            ...(reset || !lastDoc ? [] : [startAfter(lastDoc)])
          )
        } else if (filter === 'pending') {
          q = query(
            col,
            where('category', '==', 'canakkale'),
            where('socialPublished', '!=', true),
            orderBy('socialPublished'),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE),
            ...(reset || !lastDoc ? [] : [startAfter(lastDoc)])
          )
        } else {
          // all canakkale
          q = query(
            col,
            where('category', '==', 'canakkale'),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE),
            ...(reset || !lastDoc ? [] : [startAfter(lastDoc)])
          )
        }

        const snap = await getDocs(q)
        const newRows: SocialNewsRow[] = snap.docs.map((doc) => {
          const d = doc.data() as Omit<SocialNewsRow, 'id'>
          return { id: doc.id, ...d }
        })

        if (reset) {
          setRows(newRows)
        } else {
          setRows((prev) => [...prev, ...newRows])
        }

        setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
        setHasMore(snap.docs.length === PAGE_SIZE)
      } catch (err) {
        console.error('[social admin] fetch error:', err)
        toast.error('Veriler yüklenemedi')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter]
  )

  useEffect(() => {
    setLastDoc(null)
    void fetchRows(true)
  }, [filter, fetchRows])

  const triggerCron = async () => {
    if (!user || triggeringCron) return
    setTriggeringCron(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/cron/social', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as {
        processed?: number
        succeeded?: number
        failed?: number
      }
      if (res.ok) {
        toast.success(
          `Cron çalıştı — ${data.processed ?? 0} haber tarandı, ${data.succeeded ?? 0} paylaşıldı`
        )
        setLastDoc(null)
        await fetchRows(true)
      } else {
        toast.error('Cron hatası — konsolu kontrol et')
      }
    } catch (err) {
      console.error('[social admin] cron trigger error:', err)
      toast.error('Cron çalıştırılamadı')
    } finally {
      setTriggeringCron(false)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  const publishedCount = rows.filter((r) => r.socialPublished).length
  const pendingCount = rows.filter((r) => !r.socialPublished).length
  const fbCount = rows.filter((r) => r.facebookPostId).length
  const igCount = rows.filter((r) => r.instagramMediaId).length

  return (
    <div className="min-h-screen bg-[rgb(var(--color-bg))]">
      <CMSHeader title="Sosyal Medya Paylaşımları" />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:px-8">

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Toplam Çanakkale', value: rows.length, color: 'text-blue-600' },
            { label: 'Paylaşıldı', value: publishedCount, color: 'text-emerald-600' },
            { label: 'Bekliyor', value: pendingCount, color: 'text-amber-600' },
            { label: 'Facebook / Instagram', value: `${fbCount} / ${igCount}`, color: 'text-purple-600' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="text-xs text-[rgb(var(--color-muted))]">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-bold', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Filter tabs */}
          <div className="flex gap-2">
            {(['all', 'published', 'pending'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  filter === f
                    ? 'bg-[rgb(var(--color-brand))] text-white'
                    : 'bg-white/10 text-[rgb(var(--color-muted))] hover:bg-white/15 hover:text-white'
                )}
              >
                {f === 'all' ? 'Tümü' : f === 'published' ? '✓ Paylaşıldı' : '⏳ Bekliyor'}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => { setLastDoc(null); void fetchRows(true) }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Yenile
            </button>
            <button
              onClick={() => void triggerCron()}
              disabled={triggeringCron}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {triggeringCron
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Play className="h-3 w-3" />
              }
              Cron Çalıştır
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[rgb(var(--color-muted))]">Haber</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-[rgb(var(--color-muted))] sm:table-cell">Tarih</th>
                <th className="px-4 py-3 text-center font-semibold text-[rgb(var(--color-muted))]">
                  <Facebook className="inline h-3.5 w-3.5" />
                </th>
                <th className="px-4 py-3 text-center font-semibold text-[rgb(var(--color-muted))]">
                  <Instagram className="inline h-3.5 w-3.5" />
                </th>
                <th className="px-4 py-3 text-center font-semibold text-[rgb(var(--color-muted))]">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" />
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-[rgb(var(--color-muted))]">
                    <Share2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p>Haber bulunamadı</p>
                  </td>
                </tr>
              )}

              {!loading && rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-white/5">
                  {/* Title */}
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      {row.imageUrl && (
                        <img
                          src={row.imageUrl}
                          alt=""
                          className="h-10 w-16 shrink-0 rounded-md object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
                          {row.title}
                        </p>
                        {row.url && (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[rgb(var(--color-brand))] hover:underline"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            Kaynağa git
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Date */}
                  <td className="hidden px-4 py-3 text-xs text-[rgb(var(--color-muted))] sm:table-cell">
                    {row.createdAt
                      ? formatDistanceToNow(new Date(row.createdAt), { addSuffix: true, locale: tr })
                      : '—'}
                  </td>

                  {/* Facebook */}
                  <td className="px-4 py-3 text-center">
                    {row.facebookPostId ? (
                      <a
                        href={`https://www.facebook.com/${row.facebookPostId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`FB Post: ${row.facebookPostId}`}
                      >
                        <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                      </a>
                    ) : (
                      <XCircle className="mx-auto h-4 w-4 text-slate-500" />
                    )}
                  </td>

                  {/* Instagram */}
                  <td className="px-4 py-3 text-center">
                    {row.instagramMediaId ? (
                      <span title={`IG Media: ${row.instagramMediaId}`}>
                        <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                      </span>
                    ) : (
                      <XCircle className="mx-auto h-4 w-4 text-slate-500" />
                    )}
                  </td>

                  {/* Overall status */}
                  <td className="px-4 py-3 text-center">
                    <StatusBadge
                      ok={!!row.socialPublished}
                      label={row.socialPublished ? 'Paylaşıldı' : 'Bekliyor'}
                    />
                    {row.socialPublishedAt && (
                      <p className="mt-0.5 text-[10px] text-[rgb(var(--color-muted))]">
                        {formatDistanceToNow(new Date(row.socialPublishedAt), { addSuffix: true, locale: tr })}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Load more */}
        {hasMore && !loading && (
          <div className="flex justify-center">
            <button
              onClick={() => void fetchRows(false)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Daha fazla yükle
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
