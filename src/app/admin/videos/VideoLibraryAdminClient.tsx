'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, Play, RefreshCw, Search, Video } from 'lucide-react'
import {
  AdminOsEmptyState,
  AdminOsErrorState,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { turkishAdminApiError } from '@/lib/adminApiError'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import type { VideoLibraryItem, VideoMetadata } from '@/video/domain/types'

type LibraryRow = VideoLibraryItem & {
  posterPublicUrl?: string | null
  playbackPublicUrl?: string | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function platformLabel(platform: string): string {
  const map: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    x: 'X',
    facebook: 'Facebook',
    generic: 'Genel',
  }
  return map[platform] ?? platform
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    INSPECTED: 'İncelendi',
    PENDING_IMPORT: 'İçe aktarma bekliyor',
    IMPORTING: 'İçe aktarılıyor',
    READY: 'READY',
    PROCESSING: 'PROCESSING',
    PLAYBACK_READY: 'PLAYBACK_READY',
    PROCESSING_FAILED: 'PROCESSING_FAILED',
    FAILED: 'Hata',
    REJECTED: 'Reddedildi',
  }
  return map[status] ?? status
}

type InspectBody = {
  metadata?: VideoMetadata
  existing?: VideoLibraryItem | null
  error?: string
  code?: string
}

export function VideoLibraryAdminClient() {
  const { can } = useCmsAuth()
  const canCreate = can('video:create')
  const [url, setUrl] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<InspectBody | null>(null)
  const [items, setItems] = useState<LibraryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [importEnabled, setImportEnabled] = useState(false)
  const [processEnabled, setProcessEnabled] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/videos/library?pageSize=50', {
        headers: await authHeaders(),
      })
      const body = (await res.json()) as {
        items?: LibraryRow[]
        total?: number
        error?: string
        importEnabled?: boolean
        processEnabled?: boolean
      }
      if (!res.ok) throw new Error(turkishAdminApiError(res.status, body.error))
      setItems(body.items ?? [])
      setTotal(body.total ?? 0)
      setImportEnabled(body.importEnabled === true)
      setProcessEnabled(body.processEnabled === true)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Liste yüklenemedi')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const inspect = async () => {
    if (!url.trim()) {
      toast.error('Video URL girin')
      return
    }
    setInspecting(true)
    setPreview(null)
    try {
      const res = await fetch('/api/admin/videos/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'inspect', url }),
      })
      const body = (await res.json()) as InspectBody
      if (!res.ok) throw new Error(body.error || 'İnceleme başarısız')
      setPreview(body)
      if (body.existing) {
        toast('Bu video kütüphanede zaten var (ALREADY_EXISTS)')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İnceleme başarısız')
    } finally {
      setInspecting(false)
    }
  }

  const register = async () => {
    if (!url.trim() || !canCreate) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/videos/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'register', url }),
      })
      const body = (await res.json()) as {
        outcome?: string
        item?: VideoLibraryItem
        error?: string
      }
      if (!res.ok) throw new Error(body.error || 'Kayıt başarısız')
      if (body.outcome === 'ALREADY_EXISTS') {
        toast('ALREADY_EXISTS — yeni dosya oluşturulmadı')
      } else {
        toast.success('Kütüphaneye eklendi (indirme yok, yalnızca kayıt)')
      }
      setPreview(null)
      setUrl('')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const enqueueImport = async (id: string) => {
    if (!canCreate || !importEnabled) return
    setImportingId(id)
    try {
      const res = await fetch('/api/admin/videos/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'import', id }),
      })
      const body = (await res.json()) as { outcome?: string; error?: string }
      if (!res.ok) throw new Error(body.error || 'İndirme kuyruğa alınamadı')
      if (body.outcome === 'ALREADY_QUEUED') toast('İndirme zaten kuyrukta')
      else if (body.outcome === 'ALREADY_IMPORTED') toast('Bu video zaten R2’de')
      else toast.success('İndirme kuyruğa alındı')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İndirme kuyruğa alınamadı')
    } finally {
      setImportingId(null)
    }
  }

  const enqueueProcess = async (id: string) => {
    if (!canCreate || !processEnabled) return
    setProcessingId(id)
    try {
      const res = await fetch('/api/admin/videos/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'process', id }),
      })
      const body = (await res.json()) as { outcome?: string; error?: string }
      if (!res.ok) throw new Error(body.error || 'İşleme kuyruğa alınamadı')
      if (body.outcome === 'ALREADY_QUEUED') toast('İşleme zaten kuyrukta')
      else if (body.outcome === 'ALREADY_PROCESSED') toast('Playback zaten hazır')
      else toast.success('Playback kuyruğa alındı (worker ayrı çalışır)')
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşleme kuyruğa alınamadı')
    } finally {
      setProcessingId(null)
    }
  }

  const meta = preview?.metadata

  return (
    <AdminOsPageShell
      title="Video Kütüphanesi"
      subtitle="URL incele + kayıt + indirme. Playback hazırlığı ayrı worker’dadır. Publishing yok."
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/admin/videos/queue"
            className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm text-[rgb(var(--color-text))] hover:bg-slate-50"
          >
            AI kuyruk
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Yenile
          </button>
        </div>
      }
    >
      <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 md:p-5">
        <h2 className="text-sm font-semibold text-[rgb(var(--color-text))]">Link ile Ekle</h2>
        <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
          Bu fazda video indirilmez. URL normalize edilir, platform tespit edilir, kütüphane kaydı oluşur.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="video-library-url">Video URL</label>
          <input
            id="video-library-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Video URL"
            className="min-w-0 flex-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void inspect()}
            disabled={inspecting}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {inspecting ? 'İnceleniyor…' : 'Videoyu İncele'}
          </button>
        </div>

        {meta ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[rgb(var(--color-border))] p-3 sm:flex-row">
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-[rgb(var(--color-surface))] sm:w-56">
              {meta.thumbnailUrl ? (
                <img src={meta.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Play className="h-8 w-12 text-[rgb(var(--color-muted))]" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
                {meta.title || 'Başlık henüz yok'}
              </p>
              <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                {platformLabel(meta.platform)}
                {meta.source.sourceName ? ` · ${meta.source.sourceName}` : ''}
                {preview?.existing ? ' · ALREADY_EXISTS' : ''}
              </p>
              <p className="mt-1 truncate text-[11px] text-[rgb(var(--color-muted))]">
                {meta.normalizedUrl}
              </p>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => void register()}
                  disabled={saving || Boolean(preview?.existing)}
                  className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {preview?.existing ? 'Zaten kayıtlı' : saving ? 'Kaydediliyor…' : 'Kütüphaneye Ekle'}
                </button>
              ) : null}
              <p className="mt-2 text-[11px] text-[rgb(var(--color-muted))]">
                Kayıt indirme başlatmaz. İndirme için listeden “Kütüphaneye İndir” kullanın.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {loadError ? (
        <AdminOsErrorState description={loadError} onRetry={() => void load()} />
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--color-surface))]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <AdminOsEmptyState
          icon={Video}
          title="Kütüphane boş"
          description="Bir video URL’si yapıştırıp inceleyin. İndirme ayrı bir adımdır ve otomatik başlamaz."
        />
      ) : (
        <div>
          <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">{total} kayıt</p>
          <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[rgb(var(--color-surface))] text-xs uppercase text-[rgb(var(--color-muted))]">
                <tr>
                  <th className="px-3 py-2">Video</th>
                  <th className="px-3 py-2">Platform</th>
                  <th className="px-3 py-2">Kaynak</th>
                  <th className="px-3 py-2">Süre</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Depolama</th>
                  <th className="px-3 py-2">Eklenme</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-[rgb(var(--color-border))]">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md bg-[rgb(var(--color-surface))]">
                          {item.thumbnailUrl ? (
                            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <Play className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-medium text-[rgb(var(--color-text))]">
                            {item.title || item.normalizedUrl}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{platformLabel(item.platform)}</td>
                    <td className="px-3 py-2 text-[rgb(var(--color-muted))]">
                      {item.sourceName || item.sourceUsername || '—'}
                    </td>
                    <td className="px-3 py-2">{formatDuration(item.durationMs)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <span className={cn('w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          item.status === 'PLAYBACK_READY' ? 'bg-emerald-100 text-emerald-800' :
                          item.status === 'READY' ? 'bg-sky-100 text-sky-800' :
                          item.status === 'PROCESSING_FAILED' || item.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                          item.status === 'PROCESSING' || item.status === 'IMPORTING' || item.status === 'PENDING_IMPORT' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-700'
                        )}>
                          {statusLabel(item.status)}
                        </span>
                        {item.status === 'FAILED' && item.importErrorMessage ? (
                          <span className="max-w-[16rem] text-[11px] text-red-700">{item.importErrorMessage}</span>
                        ) : null}
                        {item.status === 'PROCESSING_FAILED' && item.processErrorMessage ? (
                          <span className="max-w-[16rem] text-[11px] text-red-700">{item.processErrorMessage}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-[rgb(var(--color-muted))]">
                      <div className="flex flex-col gap-1">
                        {item.originalStorageKey ? <span>original</span> : <span>Dosya yok</span>}
                        {item.posterStorageKey ? <span>poster</span> : null}
                        {item.playbackStorageKey ? <span>playback 720p</span> : null}
                        {item.posterPublicUrl ? (
                          <img src={item.posterPublicUrl} alt="" className="mt-1 h-12 w-20 rounded object-cover" />
                        ) : null}
                        {item.status === 'PLAYBACK_READY' && item.playbackPublicUrl ? (
                          <video
                            className="mt-1 max-h-40 w-40 rounded bg-black"
                            controls
                            playsInline
                            preload="metadata"
                            poster={item.posterPublicUrl ?? undefined}
                            src={item.playbackPublicUrl}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-[rgb(var(--color-muted))]">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {item.createdAt
                          ? formatDistanceToNow(new Date(item.createdAt), { locale: tr, addSuffix: true })
                          : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {canCreate && importEnabled && (item.status === 'INSPECTED' || item.status === 'FAILED') ? (
                          <button
                            type="button"
                            onClick={() => void enqueueImport(item.id)}
                            disabled={importingId === item.id}
                            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {importingId === item.id ? 'Kuyruk…' : 'Kütüphaneye İndir'}
                          </button>
                        ) : null}
                        {canCreate && processEnabled && item.originalStorageKey && (item.status === 'READY' || item.status === 'PROCESSING_FAILED') ? (
                          <button
                            type="button"
                            onClick={() => void enqueueProcess(item.id)}
                            disabled={processingId === item.id}
                            className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {processingId === item.id ? 'Kuyruk…' : 'Playback Hazırla'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminOsPageShell>
  )
}
