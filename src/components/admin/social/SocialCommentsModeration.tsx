'use client'

/**
 * Moderation of comments read back from the platforms. Nothing appears on
 * NaHaber until an editor approves it; rejected comments stay hidden; comments
 * deleted on the platform are marked «platformda silindi» and never shown.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { socialApi } from '@/components/social/socialClient'
import { PLATFORM_TR } from '@/lib/social/engagement/model'
import { cn } from '@/lib/utils'

type Status = 'pending' | 'approved' | 'rejected' | 'removed'
type Row = {
  id: string
  newsId: string
  newsTitle: string | null
  platform: 'facebook' | 'instagram' | 'threads' | 'youtube'
  author: string | null
  text: string
  createdAt: number | null
  fetchedAt: number
  status: Status
  permalink: string | null
}

type Recent = {
  newsId: string
  slug: string | null
  title: string | null
  updatedAt: number
  totals: Record<string, number>
  targets: Array<{ platform: Row['platform']; accountName: string | null; state: string; missing: string[]; permalink: string | null; metrics: Record<string, number> }>
}

const STATE_TR: Record<string, string> = {
  ok: 'okundu',
  partial: 'kısmen (ek izin gerekir)',
  permission_missing: 'izin gerekiyor',
  account_unavailable: 'hesap kullanılamıyor',
  post_unavailable: 'gönderi platformda yok',
  error: 'okunamadı',
}
const METRIC_TR: Record<string, string> = { views: 'görüntülenme', likes: 'beğeni', comments: 'yorum', shares: 'paylaşım', saves: 'kaydetme' }
const metricsText = (m: Record<string, number>) =>
  Object.keys(m).length ? Object.entries(m).map(([k, v]) => `${v} ${METRIC_TR[k] ?? k}`).join(' · ') : 'sayı yok'

const TABS: Array<[Status, string]> = [
  ['pending', 'Onay bekleyen'],
  ['approved', 'Yayında'],
  ['rejected', 'Reddedilen'],
  ['removed', 'Platformda silinen'],
]

const fmt = (t: number | null) => (t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

export function SocialCommentsModeration() {
  const [status, setStatus] = useState<Status>('pending')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [recent, setRecent] = useState<Recent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (s: Status) => {
    setRows(null)
    setError(null)
    setSelected([])
    const r = await socialApi<{ comments: Row[]; pendingCount: number; recent?: Recent[] }>(`/api/admin/social/comments?status=${s}`)
    if (!r.ok) return setError(r.status === 403 ? 'Bu ekran yalnız merkez sosyal medya yöneticilerine açık.' : 'Yorumlar yüklenemedi.')
    setRows(r.data.comments)
    setPendingCount(r.data.pendingCount)
    setRecent(r.data.recent ?? [])
  }, [])

  useEffect(() => {
    void load(status)
  }, [status, load])

  const act = async (ids: string[], action: 'approve' | 'reject') => {
    if (!ids.length) return
    setBusy(true)
    const r = await socialApi<{ updated: number; skipped: number }>('/api/admin/social/comments', { method: 'POST', body: JSON.stringify({ ids, action }) })
    setBusy(false)
    if (!r.ok) return toast.error('İşlem yapılamadı.')
    toast.success(`${r.data.updated} yorum ${action === 'approve' ? 'onaylandı — NaHaber’de en geç 10 dakika içinde görünür' : 'reddedildi'}`)
    void load(status)
  }

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const all = rows ?? []

  return (
    <section className="space-y-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {TABS.map(([s, label]) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold', status === s ? 'bg-[rgb(var(--color-brand))] text-white' : 'border border-[rgb(var(--color-border))]')}
            >
              {label}
              {s === 'pending' && pendingCount !== null ? ` (${pendingCount >= 300 ? '300+' : pendingCount})` : ''}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load(status)} className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm">
          <RefreshCw className="h-4 w-4" /> Yenile
        </button>
      </div>

      <p className="text-xs text-[rgb(var(--color-muted))]">
        Yorumlar, paylaşımdan sonraki 7 gün boyunca ortak çalışanla platformlardan okunur. Onaylanan yorum haberin ve videonun altında, platformu ve kullanıcı adıyla
        «sosyal medyadan» bölümünde görünür. Platformda silinen yorum NaHaber’den de kalkar. Instagram ve Threads yorumları için hesabın «Etkileşim ve yorum izni»
        vermiş olması gerekir (Hesaplar ekranı).
      </p>

      {status === 'pending' && all.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input type="checkbox" checked={selected.length === all.length} onChange={() => setSelected(selected.length === all.length ? [] : all.slice(0, 50).map((r) => r.id))} />
            Tümünü seç (en fazla 50)
          </label>
          <button type="button" disabled={busy || !selected.length} onClick={() => void act(selected, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
            <Check className="h-4 w-4" /> Seçilenleri onayla ({selected.length})
          </button>
          <button type="button" disabled={busy || !selected.length} onClick={() => void act(selected, 'reject')} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 font-semibold text-red-700 disabled:opacity-50">
            <X className="h-4 w-4" /> Seçilenleri reddet
          </button>
        </div>
      ) : null}

      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!rows && !error ? (
        <p className="flex items-center gap-2 text-sm text-[rgb(var(--color-muted))]">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </p>
      ) : null}
      {rows && rows.length === 0 ? <p className="rounded-lg border border-dashed border-[rgb(var(--color-border))] p-4 text-sm text-[rgb(var(--color-muted))]">Bu listede yorum yok.</p> : null}

      <ul className="space-y-2">
        {all.map((r) => (
          <li key={r.id} className="rounded-lg border border-[rgb(var(--color-border))] p-3 text-sm">
            <div className="flex items-start gap-2">
              {status === 'pending' ? <input type="checkbox" className="mt-1" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label="Yorumu seç" /> : null}
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  <b className="text-[rgb(var(--color-text))]">{PLATFORM_TR[r.platform]}</b> · {r.author ? `@${r.author}` : 'kullanıcı adı yok'} · {fmt(r.createdAt)}
                  {r.permalink ? (
                    <>
                      {' · '}
                      <a href={r.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
                        gönderi <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  ) : null}
                </p>
                <p className="whitespace-pre-wrap break-words text-[rgb(var(--color-text))]">{r.text}</p>
                <p className="truncate text-xs text-[rgb(var(--color-muted))]">Haber: {r.newsTitle ?? r.newsId}</p>
              </div>
              {status !== 'removed' ? (
                <div className="flex shrink-0 flex-col gap-1">
                  {status !== 'approved' ? (
                    <button type="button" disabled={busy} onClick={() => void act([r.id], 'approve')} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">
                      Onayla
                    </button>
                  ) : null}
                  {status !== 'rejected' ? (
                    <button type="button" disabled={busy} onClick={() => void act([r.id], 'reject')} className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50">
                      {status === 'approved' ? 'Yayından kaldır' : 'Reddet'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {recent.length > 0 ? (
        <details className="rounded-lg border border-[rgb(var(--color-border))] p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-[rgb(var(--color-text))]">Son okunan gönderiler (sayılar ve izin durumu)</summary>
          <ul className="mt-2 space-y-2">
            {recent.map((r) => (
              <li key={r.newsId} className="space-y-0.5">
                <p className="font-semibold text-[rgb(var(--color-text))]">
                  {r.slug ? (
                    <a href={`/haber/${r.slug}`} target="_blank" rel="noopener noreferrer" className="underline">
                      {r.title ?? r.newsId}
                    </a>
                  ) : (
                    r.title ?? r.newsId
                  )}{' '}
                  <span className="font-normal text-[rgb(var(--color-muted))]">· {fmt(r.updatedAt)} · toplam: {metricsText(r.totals)}</span>
                </p>
                {r.targets.map((t, i) => (
                  <p key={i} className="text-[rgb(var(--color-muted))]">
                    {PLATFORM_TR[t.platform]} {t.accountName ?? ''}: {metricsText(t.metrics)} — {STATE_TR[t.state] ?? t.state}
                    {t.missing.length ? ` (eksik izin: ${t.missing.join(', ')})` : ''}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
