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
  Facebook, Instagram, ExternalLink, Play, Tag, Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

// ── Types ──────────────────────────────────────────────────────────────────────
interface SocialNewsRow {
  id: string
  title: string
  category: string
  citySlug?: string
  thumbnail?: string
  coverImageUrl?: string
  imageUrl?: string
  url?: string
  slug?: string
  createdAt?: number
  socialPublished?: boolean
  socialPublishedAt?: number
  socialImageUrl?: string   // AI overlay görsel
  socialHeadline?: string   // AI üretilen manşet
  socialHashtags?: string[] // AI üretilen hashtagler
  facebookPostId?: string
  instagramMediaId?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

/**
 * Firestore may store timestamps as plain numbers (Date.now()) OR as Firestore
 * Timestamp objects (FieldValue.serverTimestamp()). The client SDK returns the
 * latter as Timestamp objects whose valueOf() returns a string, causing
 * `new Date(obj)` to produce Invalid Date → RangeError in date-fns.
 */
function safeToDate(val: unknown): Date | null {
  if (val == null) return null
  if (typeof val === 'number') return new Date(val)
  // Firestore Timestamp object (client SDK)
  if (typeof val === 'object' && val !== null && 'toDate' in val) {
    return (val as { toDate(): Date }).toDate()
  }
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function getBestImage(row: SocialNewsRow): string | undefined {
  return row.socialImageUrl || row.thumbnail || row.coverImageUrl || row.imageUrl
}

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

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SocialPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<SocialNewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [triggeringCron, setTriggeringCron] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagResult, setDiagResult] = useState<{ summary: string; steps: Array<{ name: string; ok: boolean; detail: string }> } | null>(null)
  const [filter, setFilter] = useState<'all' | 'published' | 'pending'>('all')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true)
      else setLoadingMore(true)

      try {
        const col = collection(db, 'news')
        let q

        if (filter === 'published') {
          // Tüm sosyal medyaya paylaşılmış haberler (city bağımsız)
          q = query(
            col,
            where('socialPublished', '==', true),
            orderBy('socialPublishedAt', 'desc'),
            limit(PAGE_SIZE),
            ...(reset || !lastDoc ? [] : [startAfter(lastDoc)])
          )
        } else if (filter === 'pending') {
          // Çanakkale haberleri — henüz paylaşılmamış
          q = query(
            col,
            where('citySlug', '==', 'canakkale'),
            where('status', '==', 'published'),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE),
            ...(reset || !lastDoc ? [] : [startAfter(lastDoc)])
          )
        } else {
          // Tümü: Çanakkale + sosyal paylaşımlar
          q = query(
            col,
            where('citySlug', '==', 'canakkale'),
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

        // Pending filtresi için memory'de `socialPublished` yokları süz
        const filtered =
          filter === 'pending'
            ? newRows.filter((r) => !r.socialPublished)
            : newRows

        if (reset) setRows(filtered)
        else setRows((prev) => [...prev, ...filtered])

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

  // ── Cron trigger ───────────────────────────────────────────────────────────
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
        error?: string
      }
      if (res.ok) {
        toast.success(
          `Cron çalıştı — ${data.processed ?? 0} haber işlendi, ${data.succeeded ?? 0} paylaşıldı`
        )
        setLastDoc(null)
        await fetchRows(true)
      } else {
        toast.error(data.error ?? 'Cron hatası — konsolu kontrol et')
      }
    } catch (err) {
      console.error('[social admin] cron trigger error:', err)
      toast.error('Cron çalıştırılamadı')
    } finally {
      setTriggeringCron(false)
    }
  }

  // ── Diagnose ───────────────────────────────────────────────────────────────
  const runDiagnose = async () => {
    if (!user || diagnosing) return
    setDiagnosing(true)
    setDiagResult(null)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/diagnose', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json() as typeof diagResult
      setDiagResult(data)
    } catch (err) {
      toast.error('Teşhis başarısız')
      console.error(err)
    } finally {
      setDiagnosing(false)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const publishedCount = rows.filter((r) => r.socialPublished).length
  const pendingCount   = rows.filter((r) => !r.socialPublished).length
  const fbCount        = rows.filter((r) => r.facebookPostId).length
  const igCount        = rows.filter((r) => r.instagramMediaId).length
  const aiImageCount   = rows.filter((r) => r.socialImageUrl).length

  return (
    <div className="min-h-screen bg-[rgb(var(--color-bg))]">
      <CMSHeader title="Sosyal Medya Paylaşımları" />

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:px-8">

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Toplam', value: rows.length, color: 'text-blue-600' },
            { label: 'Paylaşıldı', value: publishedCount, color: 'text-emerald-600' },
            { label: 'Bekliyor', value: pendingCount, color: 'text-amber-600' },
            { label: 'FB / IG', value: `${fbCount} / ${igCount}`, color: 'text-purple-600' },
            { label: 'AI Görsel', value: aiImageCount, color: 'text-pink-500' },
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
            {([
              { key: 'all',       label: 'Tümü (Çanakkale)' },
              { key: 'published', label: '✓ Paylaşıldı' },
              { key: 'pending',   label: '⏳ Bekliyor' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  filter === key
                    ? 'bg-[rgb(var(--color-brand))] text-white'
                    : 'bg-white/10 text-[rgb(var(--color-muted))] hover:bg-white/15 hover:text-white'
                )}
              >
                {label}
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
              onClick={() => void runDiagnose()}
              disabled={diagnosing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {diagnosing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              Teşhis
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

        {/* Diagnose result panel */}
        {diagResult && (
          <div className={cn(
            'rounded-xl border p-4 text-sm',
            diagResult.steps.some(s => !s.ok)
              ? 'border-red-500/30 bg-red-950/20'
              : 'border-emerald-500/30 bg-emerald-950/20'
          )}>
            <p className="mb-3 font-bold text-white">{diagResult.summary}</p>
            <div className="space-y-1.5">
              {diagResult.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={step.ok ? 'text-emerald-400' : 'text-red-400'}>
                    {step.ok ? '✓' : '✗'}
                  </span>
                  <span className="shrink-0 font-semibold text-white">{step.name}:</span>
                  <span className={cn('text-[11px]', step.ok ? 'text-slate-300' : 'text-red-300')}>
                    {step.detail}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => setDiagResult(null)} className="mt-3 text-xs text-slate-500 hover:text-white">
              Kapat
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[rgb(var(--color-muted))]">Haber</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-[rgb(var(--color-muted))] md:table-cell">AI İçerik</th>
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
                  <td colSpan={6} className="py-16 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" />
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-[rgb(var(--color-muted))]">
                    <Share2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p>Haber bulunamadı</p>
                  </td>
                </tr>
              )}

              {!loading && rows.map((row) => {
                const img = getBestImage(row)
                const articleUrl = row.url ?? (row.slug ? `/news/${row.slug}` : null)
                return (
                  <tr key={row.id} className="transition-colors hover:bg-white/5">
                    {/* Haber başlığı + görsel */}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {img ? (
                          <div className="relative h-12 w-20 shrink-0">
                            <img
                              src={img}
                              alt=""
                              className="h-12 w-20 rounded-md object-cover"
                            />
                            {row.socialImageUrl && (
                              <span title="AI overlay görsel" className="absolute -right-1 -top-1 rounded-full bg-pink-500 p-0.5">
                                <ImageIcon className="h-2.5 w-2.5 text-white" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-white/10">
                            <ImageIcon className="h-5 w-5 opacity-30" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
                            {row.title}
                          </p>
                          {articleUrl && (
                            <a
                              href={articleUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-[rgb(var(--color-brand))] hover:underline"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              Habere git
                            </a>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* AI üretilen içerik */}
                    <td className="hidden px-4 py-3 md:table-cell">
                      {row.socialHeadline ? (
                        <div className="max-w-[200px]">
                          <p className="line-clamp-1 text-xs font-medium text-white">
                            {row.socialHeadline}
                          </p>
                          {row.socialHashtags && row.socialHashtags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {row.socialHashtags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-0.5 rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-400"
                                >
                                  <Tag className="h-2 w-2" />
                                  {tag.replace('#', '')}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[rgb(var(--color-muted))]">—</span>
                      )}
                    </td>

                    {/* Tarih */}
                    <td className="hidden px-4 py-3 text-xs text-[rgb(var(--color-muted))] sm:table-cell">
                      <div>
                        {(() => { const d = safeToDate(row.createdAt); return d ? formatDistanceToNow(d, { addSuffix: true, locale: tr }) : '—' })()}
                      </div>
                      {row.socialPublishedAt && (
                        <div className="mt-0.5 text-[10px] text-emerald-500">
                          Paylaşıldı:{' '}
                          {(() => { const d = safeToDate(row.socialPublishedAt); return d ? formatDistanceToNow(d, { addSuffix: true, locale: tr }) : '—' })()}
                        </div>
                      )}
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

                    {/* Durum */}
                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        ok={!!row.socialPublished}
                        label={row.socialPublished ? 'Paylaşıldı' : 'Bekliyor'}
                      />
                    </td>
                  </tr>
                )
              })}
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

        {/* Duplikat önleme notu */}
        <p className="text-center text-xs text-[rgb(var(--color-muted))]">
          Sistem her haber için hem ID hem başlık kontrolü yaparak aynı haberi iki kez paylaşmaz.
        </p>
      </div>
    </div>
  )
}
