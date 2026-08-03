'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
  Newspaper, BookImage, Search, KeyRound, Stethoscope,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants/routes'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'

// ── Types ──────────────────────────────────────────────────────────────────────
type TabKey = 'post' | 'story'
type StatusFilter = 'all' | 'published' | 'pending'

interface SocialNewsRow {
  id: string
  title: string
  category?: string
  categoryId?: string
  citySlug?: string
  city?: string
  status?: string
  thumbnail?: string
  coverImageUrl?: string
  imageUrl?: string
  url?: string
  slug?: string
  sourceUrl?: string
  createdAt?: number | { toDate(): Date }
  publishedAt?: number | { toDate(): Date }
  socialPublished?: boolean
  socialPublishedAt?: number | { toDate(): Date }
  storyPublished?: boolean
  storyPublishedAt?: number | { toDate(): Date }
  socialImageUrl?: string
  socialHeadline?: string
  socialStorySummary?: string
  socialHashtags?: string[]
  facebookPostId?: string
  instagramMediaId?: string
  facebookStoryId?: string
  instagramStoryId?: string
  featured?: boolean
  isFeatured?: boolean
  hasVideo?: boolean
  isVideo?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 24

function safeToDate(val: unknown): Date | null {
  if (val == null) return null
  if (typeof val === 'number') return new Date(val)
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

function hasImage(row: SocialNewsRow): boolean {
  return !!getBestImage(row)
}

function isLikelyExternalRss(row: SocialNewsRow): boolean {
  const src = (row.sourceUrl ?? '').trim().toLowerCase()
  if (!src || !src.startsWith('http')) return false
  return !src.includes('nahaber.com') && !src.includes('onyeditivi.com')
}

function isShared(row: SocialNewsRow, tab: TabKey): boolean {
  return tab === 'post' ? !!row.socialPublished : !!row.storyPublished
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        ok
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
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
  const [tab, setTab] = useState<TabKey>('post')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<SocialNewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [triggeringCron, setTriggeringCron] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagResult, setDiagResult] = useState<{ summary: string; steps: Array<{ name: string; ok: boolean; detail: string }> } | null>(null)
  const [showTokenPanel, setShowTokenPanel] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [newFbToken, setNewFbToken] = useState('')
  const [newIgToken, setNewIgToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)
  const [tokenResult, setTokenResult] = useState<{ ok: boolean; message: string; permissions?: string[]; note?: string } | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRows = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true)
      else setLoadingMore(true)

      try {
        const col = collection(db, 'news')
        const cursor = reset ? null : lastDoc

        const runQuery = async () => {
          if (tab === 'post' && statusFilter === 'published') {
            return getDocs(query(
              col,
              where('socialPublished', '==', true),
              orderBy('socialPublishedAt', 'desc'),
              limit(PAGE_SIZE),
              ...(cursor ? [startAfter(cursor)] : []),
            ))
          }
          if (tab === 'story' && statusFilter === 'published') {
            try {
              return await getDocs(query(
                col,
                where('storyPublished', '==', true),
                orderBy('storyPublishedAt', 'desc'),
                limit(PAGE_SIZE),
                ...(cursor ? [startAfter(cursor)] : []),
              ))
            } catch {
              // Index yoksa publishedAt ile geniş liste + client filter
              return getDocs(query(
                col,
                where('status', '==', 'published'),
                orderBy('publishedAt', 'desc'),
                limit(PAGE_SIZE * 2),
                ...(cursor ? [startAfter(cursor)] : []),
              ))
            }
          }
          if (tab === 'post' && statusFilter === 'pending') {
            return getDocs(query(
              col,
              where('citySlug', '==', 'canakkale'),
              where('status', '==', 'published'),
              orderBy('publishedAt', 'desc'),
              limit(PAGE_SIZE),
              ...(cursor ? [startAfter(cursor)] : []),
            ))
          }
          if (tab === 'story' && statusFilter === 'pending') {
            try {
              return await getDocs(query(
                col,
                where('status', '==', 'published'),
                where('categoryId', '==', 'gundem'),
                orderBy('publishedAt', 'desc'),
                limit(PAGE_SIZE),
                ...(cursor ? [startAfter(cursor)] : []),
              ))
            } catch {
              return getDocs(query(
                col,
                where('status', '==', 'published'),
                orderBy('publishedAt', 'desc'),
                limit(PAGE_SIZE),
                ...(cursor ? [startAfter(cursor)] : []),
              ))
            }
          }
          // Tümü: yayınlanmış haberler (manuel seçim için geniş liste)
          return getDocs(query(
            col,
            where('status', '==', 'published'),
            orderBy('publishedAt', 'desc'),
            limit(PAGE_SIZE),
            ...(cursor ? [startAfter(cursor)] : []),
          ))
        }

        const snap = await runQuery()

        let newRows: SocialNewsRow[] = snap.docs.map((doc) => {
          const d = doc.data() as Omit<SocialNewsRow, 'id'>
          return { id: doc.id, ...d }
        })

        if (statusFilter === 'pending') {
          newRows = newRows.filter((r) => !isShared(r, tab) && !r.hasVideo && !r.isVideo)
        }
        if (tab === 'story' && statusFilter === 'published') {
          newRows = newRows.filter((r) => !!r.storyPublished)
        }

        if (reset) setRows(newRows)
        else setRows((prev) => [...prev, ...newRows])

        setLastDoc(snap.docs[snap.docs.length - 1] ?? null)
        setHasMore(snap.docs.length >= PAGE_SIZE)
      } catch (err) {
        console.error('[social admin] fetch error:', err)
        toast.error('Veriler yüklenemedi')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, statusFilter]
  )

  useEffect(() => {
    setLastDoc(null)
    setRows([])
    void fetchRows(true)
  }, [tab, statusFilter, fetchRows])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      r.title?.toLowerCase().includes(q) ||
      r.slug?.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.citySlug?.toLowerCase().includes(q) ||
      r.categoryId?.toLowerCase().includes(q)
    )
  }, [rows, search])

  // ── Share one ──────────────────────────────────────────────────────────────
  const shareOne = async (row: SocialNewsRow) => {
    if (!user || sharingId) return

    if (isLikelyExternalRss(row)) {
      toast.error('Harici RSS haberi — yalnızca NaHaber içerikleri paylaşılabilir')
      return
    }
    if (!hasImage(row)) {
      toast.error('Görsel yok — paylaşım için kapak görseli gerekli')
      return
    }

    const already = isShared(row, tab)
    if (already) {
      const ok = window.confirm(
        tab === 'post'
          ? 'Bu haber zaten feed post olarak paylaşılmış. Yeniden paylaşmak istiyor musunuz?'
          : 'Bu haber zaten hikâye olarak paylaşılmış. Yeniden paylaşmak istiyor musunuz?'
      )
      if (!ok) return
    }

    setSharingId(row.id)
    const toastId = toast.loading(
      tab === 'post' ? 'Feed post paylaşılıyor…' : 'Hikâye paylaşılıyor…'
    )
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/force-reshare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ids: [row.id],
          mode: tab,
          force: true,
          manual: true,
        }),
      })
      const data = await res.json() as {
        error?: string
        succeeded?: number
        results?: Array<{
          ok: boolean
          reason?: string
          post?: { facebook: { success: boolean }; instagram: { success: boolean } }
          story?: { facebook: { success: boolean }; instagram: { success: boolean } }
        }>
      }

      if (!res.ok) {
        toast.error(data.error ?? 'Paylaşım başarısız', { id: toastId })
        return
      }

      const r0 = data.results?.[0]
      const fbOk = tab === 'post' ? r0?.post?.facebook.success : r0?.story?.facebook.success
      const igOk = tab === 'post' ? r0?.post?.instagram.success : r0?.story?.instagram.success
      toast.success(
        `Paylaşıldı — FB: ${fbOk ? '✓' : '✗'} · IG: ${igOk ? '✓' : '✗'}`,
        { id: toastId }
      )

      // Optimistic local update
      setRows((prev) => prev.map((r) => {
        if (r.id !== row.id) return r
        if (tab === 'post') {
          return { ...r, socialPublished: true, socialPublishedAt: Date.now() }
        }
        return { ...r, storyPublished: true, storyPublishedAt: Date.now() }
      }))
    } catch (err) {
      console.error('[social admin] share error:', err)
      toast.error('Bağlantı hatası', { id: toastId })
    } finally {
      setSharingId(null)
    }
  }

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
        toast.error(data.error ?? 'Cron hatası')
      }
    } catch (err) {
      console.error('[social admin] cron trigger error:', err)
      toast.error('Cron çalıştırılamadı')
    } finally {
      setTriggeringCron(false)
    }
  }

  // ── Token güncelle ─────────────────────────────────────────────────────────
  const saveToken = async () => {
    if (!user || savingToken || !newFbToken.trim()) return
    setSavingToken(true)
    setTokenResult(null)
    try {
      const idToken = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/social/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ facebookPageToken: newFbToken.trim(), instagramToken: newIgToken.trim() || undefined }),
      })
      const data = await res.json() as { ok?: boolean; message?: string; permissions?: string[]; note?: string; error?: string }
      if (res.ok && data.ok) {
        setTokenResult({ ok: true, message: data.message ?? 'Token kaydedildi', permissions: data.permissions, note: data.note })
        setNewFbToken('')
        setNewIgToken('')
        toast.success('Token başarıyla güncellendi!')
      } else {
        setTokenResult({ ok: false, message: data.error ?? 'Hata oluştu' })
        toast.error(data.error ?? 'Token kaydedilemedi')
      }
    } catch (err) {
      toast.error('Bağlantı hatası')
      console.error(err)
    } finally {
      setSavingToken(false)
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
  const publishedCount = rows.filter((r) => isShared(r, tab)).length
  const pendingCount   = rows.filter((r) => !isShared(r, tab)).length
  const fbCount = tab === 'post'
    ? rows.filter((r) => r.facebookPostId).length
    : rows.filter((r) => r.facebookStoryId).length
  const igCount = tab === 'post'
    ? rows.filter((r) => r.instagramMediaId).length
    : rows.filter((r) => r.instagramStoryId).length

  return (
    <div className="min-h-screen bg-[rgb(var(--color-bg))]">
      <CMSHeader title="Sosyal Medya" />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8">

        {/* Primary tabs: Post / Hikâye */}
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {([
            { key: 'post' as const,  label: 'Post',   icon: Newspaper, hint: 'FB / IG feed' },
            { key: 'story' as const, label: 'Hikâye', icon: BookImage, hint: 'FB / IG story' },
          ]).map(({ key, label, icon: Icon, hint }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setStatusFilter('all'); setSearch('') }}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors',
                tab === key
                  ? 'bg-[rgb(var(--color-brand))] text-white shadow'
                  : 'text-[rgb(var(--color-muted))] hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span className={cn(
                'hidden text-[10px] font-medium sm:inline',
                tab === key ? 'text-white/70' : 'text-[rgb(var(--color-muted))]'
              )}>
                {hint}
              </span>
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Listelenen', value: rows.length, color: 'text-blue-600' },
            { label: 'Paylaşıldı', value: publishedCount, color: 'text-emerald-600' },
            { label: 'Bekliyor', value: pendingCount, color: 'text-amber-600' },
            { label: 'FB / IG', value: `${fbCount} / ${igCount}`, color: 'text-purple-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3.5">
              <p className="text-xs text-[rgb(var(--color-muted))]">{s.label}</p>
              <p className={cn('mt-0.5 text-xl font-bold', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'all' as const, label: 'Tümü' },
              { key: 'pending' as const, label: 'Bekliyor' },
              { key: 'published' as const, label: 'Paylaşıldı' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  statusFilter === key
                    ? 'bg-white/20 text-white'
                    : 'bg-white/5 text-[rgb(var(--color-muted))] hover:bg-white/10 hover:text-white'
                )}
              >
                {label}
              </button>
            ))}

            <div className="relative ml-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--color-muted))]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Başlık / slug ara…"
                className="w-44 rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-brand))] sm:w-56"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setLastDoc(null); void fetchRows(true) }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Yenile
            </button>
            <button
              onClick={() => setShowTools((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
            >
              Araçlar
            </button>
          </div>
        </div>

        {/* Secondary tools (collapsed by default) */}
        {showTools && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <button
              onClick={() => { setShowTokenPanel((p) => !p); setTokenResult(null) }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
            >
              <KeyRound className="h-3 w-3" />
              Token Güncelle
            </button>
            <button
              onClick={() => void runDiagnose()}
              disabled={diagnosing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {diagnosing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Stethoscope className="h-3 w-3" />}
              Teşhis
            </button>
            <button
              onClick={() => void triggerCron()}
              disabled={triggeringCron}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-500 disabled:opacity-50"
            >
              {triggeringCron ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Cron Çalıştır
            </button>
            <p className="w-full text-[11px] text-[rgb(var(--color-muted))]">
              Asıl yol: listeden haber seç → «Sosyal medyada paylaş». Cron otomatik uygun haberleri işler.
            </p>
          </div>
        )}

        {/* Token panel */}
        {showTokenPanel && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-5">
            <h3 className="mb-1 font-bold text-white">Facebook / Instagram Token Güncelle</h3>
            <p className="mb-4 text-xs text-slate-400">
              Token eksik izinlere sahip olduğunda paylaşımlar çalışmaz. Graph API Explorer&apos;dan Page Token alın.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  Facebook Page Access Token <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={newFbToken}
                  onChange={e => setNewFbToken(e.target.value)}
                  rows={3}
                  placeholder="EAAWo..."
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  Instagram Access Token <span className="text-slate-500">(opsiyonel)</span>
                </label>
                <textarea
                  value={newIgToken}
                  onChange={e => setNewIgToken(e.target.value)}
                  rows={2}
                  placeholder="EAAWo... (opsiyonel)"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {tokenResult && (
                <div className={cn(
                  'rounded-lg px-3 py-2 text-xs',
                  tokenResult.ok ? 'bg-emerald-900/30 text-emerald-300' : 'bg-red-900/30 text-red-300'
                )}>
                  {tokenResult.ok ? '✅' : '❌'} {tokenResult.message}
                  {tokenResult.ok && tokenResult.note && (
                    <div className="mt-1 text-[10px] text-slate-400">{tokenResult.note}</div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => void saveToken()}
                  disabled={savingToken || !newFbToken.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {savingToken ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Doğrula & Kaydet
                </button>
                <button
                  onClick={() => { setShowTokenPanel(false); setTokenResult(null) }}
                  className="rounded-lg px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diagnose result */}
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

        {/* Hint */}
        <p className="text-xs text-[rgb(var(--color-muted))]">
          {tab === 'post'
            ? 'Post sekmesi: seçtiğiniz haberi FB/IG feed’e paylaşır. Cron otomatik olarak Çanakkale haberlerini işler; burada istediğiniz kendi içeriği seçebilirsiniz.'
            : 'Hikâye sekmesi: seçtiğiniz haberi FB/IG story olarak paylaşır. Meta link sticker bazı hesaplarda kısıtlı olabilir.'}
        </p>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[rgb(var(--color-muted))]">Haber</th>
                <th className="hidden px-4 py-3 text-left font-semibold text-[rgb(var(--color-muted))] md:table-cell">
                  {tab === 'post' ? 'Caption / AI' : 'Hikâye özeti'}
                </th>
                <th className="hidden px-4 py-3 text-left font-semibold text-[rgb(var(--color-muted))] sm:table-cell">Tarih</th>
                <th className="px-4 py-3 text-center font-semibold text-[rgb(var(--color-muted))]">
                  <Facebook className="inline h-3.5 w-3.5" />
                </th>
                <th className="px-4 py-3 text-center font-semibold text-[rgb(var(--color-muted))]">
                  <Instagram className="inline h-3.5 w-3.5" />
                </th>
                <th className="px-4 py-3 text-center font-semibold text-[rgb(var(--color-muted))]">Durum</th>
                <th className="px-4 py-3 text-right font-semibold text-[rgb(var(--color-muted))]">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" />
                  </td>
                </tr>
              )}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[rgb(var(--color-muted))]">
                    <Share2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p>Haber bulunamadı</p>
                  </td>
                </tr>
              )}

              {!loading && filteredRows.map((row) => {
                const img = getBestImage(row)
                const articleUrl = row.url ?? (row.slug ? ROUTES.NEWS_DETAIL(row.slug) : null)
                const shared = isShared(row, tab)
                const external = isLikelyExternalRss(row)
                const noImg = !hasImage(row)
                const fbOk = tab === 'post' ? !!row.facebookPostId : !!row.facebookStoryId
                const igOk = tab === 'post' ? !!row.instagramMediaId : !!row.instagramStoryId
                const isBusy = sharingId === row.id

                return (
                  <tr key={row.id} className="transition-colors hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        {img ? (
                          <div className="relative h-12 w-20 shrink-0">
                            <img src={img} alt="" className="h-12 w-20 rounded-md object-cover" />
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
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {row.citySlug && (
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">
                                {row.citySlug}
                              </span>
                            )}
                            {row.categoryId && (
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">
                                {row.categoryId}
                              </span>
                            )}
                            {external && (
                              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">
                                RSS
                              </span>
                            )}
                            {articleUrl && (
                              <a
                                href={articleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] text-[rgb(var(--color-brand))] hover:underline"
                              >
                                <ExternalLink className="h-2.5 w-2.5" />
                                Habere git
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="hidden px-4 py-3 md:table-cell">
                      {tab === 'post' ? (
                        row.socialHeadline ? (
                          <div className="max-w-[220px]">
                            <p className="line-clamp-1 text-xs font-medium text-white">{row.socialHeadline}</p>
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
                        )
                      ) : (
                        row.socialStorySummary || row.socialHeadline ? (
                          <p className="line-clamp-2 max-w-[220px] text-xs text-slate-300">
                            {row.socialStorySummary || row.socialHeadline}
                          </p>
                        ) : (
                          <span className="text-xs text-[rgb(var(--color-muted))]">—</span>
                        )
                      )}
                    </td>

                    <td className="hidden px-4 py-3 text-xs text-[rgb(var(--color-muted))] sm:table-cell">
                      <div>
                        {(() => {
                          const d = safeToDate(row.publishedAt ?? row.createdAt)
                          return d ? formatDistanceToNow(d, { addSuffix: true, locale: tr }) : '—'
                        })()}
                      </div>
                      {shared && (
                        <div className="mt-0.5 text-[10px] text-emerald-500">
                          Paylaşıldı:{' '}
                          {(() => {
                            const d = safeToDate(tab === 'post' ? row.socialPublishedAt : row.storyPublishedAt)
                            return d ? formatDistanceToNow(d, { addSuffix: true, locale: tr }) : '—'
                          })()}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {fbOk
                        ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        : <XCircle className="mx-auto h-4 w-4 text-slate-500" />}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {igOk
                        ? <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        : <XCircle className="mx-auto h-4 w-4 text-slate-500" />}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        ok={shared}
                        label={shared ? 'Paylaşıldı' : 'Bekliyor'}
                      />
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void shareOne(row)}
                        disabled={!!sharingId || external || noImg}
                        title={
                          external
                            ? 'Harici RSS — paylaşılamaz'
                            : noImg
                              ? 'Görsel gerekli'
                              : shared
                                ? 'Yeniden paylaş'
                                : tab === 'post'
                                  ? 'Feed post olarak paylaş'
                                  : 'Hikâye olarak paylaş'
                        }
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                          shared
                            ? 'bg-white/10 text-white hover:bg-white/15'
                            : 'bg-[rgb(var(--color-brand))] text-white hover:opacity-90'
                        )}
                      >
                        {isBusy
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Share2 className="h-3 w-3" />}
                        <span className="hidden sm:inline">
                          {shared ? 'Yeniden paylaş' : 'Sosyal medyada paylaş'}
                        </span>
                        <span className="sm:hidden">Paylaş</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

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

        <p className="text-center text-xs text-[rgb(var(--color-muted))]">
          Harici RSS haberleri engellenir. Görselsiz haberler paylaşılamaz. Sistem aynı haberi çift paylaşmamak için bayrak tutar; yeniden paylaş onay ister.
        </p>
      </div>
    </div>
  )
}
