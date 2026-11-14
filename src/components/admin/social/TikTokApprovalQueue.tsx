'use client'

/**
 * TIKTOK-AUTO-1 — «TikTok onayı bekliyor»: automation found a matching story for a
 * TikTok account and prepared its reel; the editor posts it with one click through the
 * regular TikTok dialog (TikTok requires the user's express consent per upload) or
 * skips it. Renders nothing when the list is empty.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { reelsCall } from './reelsApi'
import { TikTokPostDialog } from './TikTokPostDialog'

type Item = { jobId: string; newsId: string; newsTitle: string; accountId: string; accountName: string; createdAt: number; hasVideo: boolean }

const ago = (ms: number) => {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000))
  return m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.round(m / 60)} sa önce` : `${Math.round(m / 1440)} gün önce`
}

export function TikTokApprovalQueue() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [open, setOpen] = useState<Item | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await reelsCall<{ items: Item[] }>('GET', '/api/admin/social/tiktok?queue=1')
    if (r.ok) {
      setItems(r.data.items)
      setError(null)
    } else setError(r.error)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const skip = async (it: Item) => {
    setBusy(it.jobId)
    const r = await reelsCall('POST', '/api/admin/social/tiktok', { dismissJobId: it.jobId })
    setBusy(null)
    if (!r.ok) return setError(r.error)
    void load()
  }

  if (error) return <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">TikTok onay listesi: {error}</p>
  if (!items || items.length === 0) return null

  return (
    <section className="mb-4 rounded-xl border border-black/80 bg-[rgb(var(--color-card))] p-3" aria-label="TikTok onayı bekliyor">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-black px-1.5 py-0.5 text-[11px] font-bold text-white">TikTok</span>
        <p className="text-sm font-extrabold">Onay bekleyen {items.length} video</p>
        <span className="text-xs text-[rgb(var(--color-muted))]">Otomasyon kuralına uyan haberler; TikTok her video için onayınızı istiyor.</span>
      </div>
      <ul className="divide-y divide-[rgb(var(--color-border))]">
        {items.map((it) => (
          <li key={it.jobId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{it.newsTitle}</p>
              <p className="text-xs text-[rgb(var(--color-muted))]">
                {it.accountName} · {ago(it.createdAt)} · {it.hasVideo ? 'video hazır' : 'video hazırlanıyor (pencerede oluşturulabilir)'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(it)} className="rounded-lg bg-black px-3 py-1.5 text-xs font-bold text-white">
              Onayla ve paylaş
            </button>
            <button type="button" disabled={busy === it.jobId} onClick={() => void skip(it)} className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-bold disabled:opacity-60">
              {busy === it.jobId ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Atla
            </button>
          </li>
        ))}
      </ul>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="TikTok’ta paylaş">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-[rgb(var(--color-card))] p-4 shadow-xl">
            <div className="mb-2 flex items-start gap-2">
              <p className="flex-1 text-sm font-extrabold">TikTok — {open.newsTitle}</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(null)
                  void load()
                }}
                aria-label="Kapat"
                className="rounded p-1 hover:bg-[rgb(var(--color-surface))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <TikTokPostDialog key={open.jobId} newsId={open.newsId} defaultAccountId={open.accountId} onFinished={() => void load()} />
          </div>
        </div>
      ) : null}
    </section>
  )
}
