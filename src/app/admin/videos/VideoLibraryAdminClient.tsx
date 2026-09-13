'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, ExternalLink, Play, RefreshCw, Search, Video } from 'lucide-react'
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
import type { VideoLibraryItem } from '@/video/domain/types'
import type { BulkInspectRow } from '@/video/library/inspectBulk'

type LibraryRow = VideoLibraryItem & {
  posterPublicUrl?: string | null
  playbackPublicUrl?: string | null
}

type JobRow = {
  id: string
  itemId: string
  kind: string
  status: string
  attempts: number
  errorCode: string | null
  lastError: string | null
  sourceUrl: string | null
  createdAt: string | Date
  startedAt: string | Date | null
  finishedAt: string | Date | null
  title: string | null
  platform: string | null
  originalUrl: string | null
}

type TabId = 'library' | 'add' | 'queue'

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

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function platformLabel(platform: string | null): string {
  const map: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    x: 'X',
    facebook: 'Facebook',
    generic: 'Doğrudan dosya',
  }
  return platform ? map[platform] ?? platform : '—'
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    INSPECTED: 'İncelendi',
    PENDING_IMPORT: 'Kuyrukta',
    IMPORTING: 'İndiriliyor',
    READY: 'Depolandı',
    PROCESSING: 'İşleniyor',
    PLAYBACK_READY: 'Oynatılabilir',
    PROCESSING_FAILED: 'İşleme hatası',
    FAILED: 'Hata',
    REJECTED: 'Reddedildi',
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    SUCCEEDED: 'SUCCEEDED',
  }
  return map[status] ?? status
}

function rightsLabel(status: string): string {
  const map: Record<string, string> = {
    UNKNOWN: 'UNKNOWN',
    OWNED: 'OWNED',
    LICENSED: 'LICENSED',
    PARTNER: 'PARTNER',
    PERMISSION_GRANTED: 'PERMISSION_GRANTED',
    EMBED_ONLY: 'EMBED_ONLY',
  }
  return map[status] ?? status
}

function formatWhen(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return formatDistanceToNow(date, { locale: tr, addSuffix: true })
}

export function VideoLibraryAdminClient() {
  const { can } = useCmsAuth()
  const canCreate = can('video:create')
  const [tab, setTab] = useState<TabId>('add')
  const [text, setText] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [rows, setInspectRows] = useState<BulkInspectRow[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [queueing, setQueueing] = useState(false)
  const [items, setItems] = useState<LibraryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [importEnabled, setImportEnabled] = useState(false)
  const [previewItem, setPreviewItem] = useState<LibraryRow | null>(null)

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
      }
      if (!res.ok) throw new Error(turkishAdminApiError(res.status, body.error))
      setItems(body.items ?? [])
      setTotal(body.total ?? 0)
      setImportEnabled(body.importEnabled === true)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Liste yüklenemedi')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadJobs = useCallback(async () => {
    setJobsLoading(true)
    setJobsError(null)
    try {
      const res = await fetch('/api/admin/videos/library?view=jobs', {
        headers: await authHeaders(),
      })
      const body = (await res.json()) as { jobs?: JobRow[]; error?: string; importEnabled?: boolean }
      if (!res.ok) throw new Error(turkishAdminApiError(res.status, body.error))
      setJobs(body.jobs ?? [])
      if (typeof body.importEnabled === 'boolean') setImportEnabled(body.importEnabled)
    } catch (err) {
      setJobsError(err instanceof Error ? err.message : 'Kuyruk yüklenemedi')
      setJobs([])
    } finally {
      setJobsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (tab === 'queue') void loadJobs()
  }, [tab, loadJobs])

  const inspect = async () => {
    if (!text.trim()) {
      toast.error('Bir veya birden fazla URL yapıştırın')
      return
    }
    setInspecting(true)
    try {
      const res = await fetch('/api/admin/videos/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'inspect-bulk', text }),
      })
      const body = (await res.json()) as {
        rows?: BulkInspectRow[]
        error?: string
      }
      if (!res.ok) throw new Error(body.error || 'İnceleme başarısız')
      setInspectRows(body.rows ?? [])
      setSelected({})
      toast.success('İnceleme tamamlandı — indirme başlamadı')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İnceleme başarısız')
    } finally {
      setInspecting(false)
    }
  }

  const selectedUrls = useMemo(
    () => rows.filter((row) => selected[row.originalUrl]).map((row) => row.originalUrl),
    [rows, selected]
  )
  const downloadableRows = useMemo(() => rows.filter((row) => row.downloadable && !row.error), [rows])

  const enqueueSelected = async () => {
    if (!canCreate || !importEnabled) return
    if (selectedUrls.length === 0) {
      toast.error('Seçim yok')
      return
    }
    setQueueing(true)
    try {
      const res = await fetch('/api/admin/videos/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'import-selected', urls: selectedUrls }),
      })
      const body = (await res.json()) as { queued?: number; skipped?: number; error?: string }
      if (!res.ok) throw new Error(body.error || 'Kuyruk başarısız')
      toast.success(`${body.queued ?? 0} indirme kuyruğa alındı`)
      setTab('queue')
      void load()
      void loadJobs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kuyruk başarısız')
    } finally {
      setQueueing(false)
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
      void loadJobs()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İndirme kuyruğa alınamadı')
    } finally {
      setImportingId(null)
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'library', label: 'VIDEO KÜTÜPHANESİ' },
    { id: 'add', label: 'LİNK İLE EKLE' },
    { id: 'queue', label: 'İNDİRME KUYRUĞU' },
  ]

  return (
    <AdminOsPageShell
      title="Video Kütüphanesi"
      subtitle="İnceleme indirme başlatmaz. Seçilen desteklenen URL’ler kuyruğa alınır. Yayın yok."
      actions={
        <button
          type="button"
          onClick={() => {
            void load()
            if (tab === 'queue') void loadJobs()
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Yenile
        </button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold',
              tab === item.id
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'add' ? (
        <section className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 md:p-5">
          <h2 className="text-sm font-semibold text-[rgb(var(--color-text))]">Link ile Ekle</h2>
          <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
            Bir veya birden fazla URL yapıştırın. Her satıra bir URL. İnceleme dosya indirmez.
          </p>
          <label className="sr-only" htmlFor="video-library-urls">Video URL listesi</label>
          <textarea
            id="video-library-urls"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'https://cdn.example.com/clip.mp4\nhttps://www.youtube.com/watch?v=...'}
            className="mt-3 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => void inspect()}
            disabled={inspecting}
            className="mt-3 inline-flex items-center justify-center gap-1 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {inspecting ? 'İnceleniyor…' : 'İNCELE'}
          </button>

          {rows.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(Object.fromEntries(rows.map((row) => [row.originalUrl, true])))
                  }
                  className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold"
                >
                  TÜMÜNÜ SEÇ
                </button>
                <button
                  type="button"
                  onClick={() => setSelected({})}
                  className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold"
                >
                  SEÇİMİ KALDIR
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(Object.fromEntries(downloadableRows.map((row) => [row.originalUrl, true])))
                  }
                  className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-xs font-semibold"
                >
                  DESTEKLENENLERİ SEÇ
                </button>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => void enqueueSelected()}
                    disabled={queueing || !importEnabled || selectedUrls.length === 0}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {!importEnabled
                      ? 'İndirme henüz etkin değil'
                      : queueing
                        ? 'Kuyruk…'
                        : 'SEÇİLENLERİ KÜTÜPHANEYE İNDİR'}
                  </button>
                ) : null}
              </div>
              {!importEnabled ? (
                <p className="text-[11px] text-amber-700">
                  İndirme henüz etkin değil. İnceleme dosya indirmez ve iş oluşturmaz.
                </p>
              ) : null}
              <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase text-[rgb(var(--color-muted))]">
                    <tr>
                      <th className="px-3 py-2"></th>
                      <th className="px-3 py-2">Önizleme</th>
                      <th className="px-3 py-2">Başlık</th>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2">Kaynak</th>
                      <th className="px-3 py-2">URL</th>
                      <th className="px-3 py-2">Süre</th>
                      <th className="px-3 py-2">Hak</th>
                      <th className="px-3 py-2">Tekrar</th>
                      <th className="px-3 py-2">İndirme</th>
                      <th className="px-3 py-2">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.originalUrl} className="border-t border-[rgb(var(--color-border))]">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={Boolean(selected[row.originalUrl])}
                            onChange={(e) =>
                              setSelected((prev) => ({ ...prev, [row.originalUrl]: e.target.checked }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-12 w-20 overflow-hidden rounded bg-[rgb(var(--color-surface))]">
                            {row.thumbnailUrl ? (
                              <img src={row.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <Play className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">{row.title || '—'}</td>
                        <td className="px-3 py-2">{platformLabel(row.platform)}</td>
                        <td className="px-3 py-2 text-xs text-[rgb(var(--color-muted))]">
                          {row.sourceName || row.sourceUsername || '—'}
                        </td>
                        <td className="max-w-xs px-3 py-2 text-[11px]">
                          <p className="truncate">{row.originalUrl}</p>
                          <p className="truncate text-[rgb(var(--color-muted))]">{row.normalizedUrl || '—'}</p>
                        </td>
                        <td className="px-3 py-2">{formatDuration(row.durationMs)}</td>
                        <td className="px-3 py-2 text-xs">{row.rightsStatus}</td>
                        <td className="px-3 py-2 text-xs">{row.duplicate ? 'VAR' : 'YOK'}</td>
                        <td className="px-3 py-2 text-xs">
                          {row.downloadable ? 'DOWNLOAD_SUPPORTED' : row.downloadCode || 'UNSUPPORTED'}
                        </td>
                        <td className="px-3 py-2 text-xs text-red-700">{row.error || row.downloadMessage || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'library' ? (
        loadError ? (
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
            description="Link ile Ekle sekmesinden URL inceleyin. İndirme ayrı bir adımdır."
          />
        ) : (
          <div>
            <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">{total} kayıt</p>
            <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[rgb(var(--color-surface))] text-xs uppercase text-[rgb(var(--color-muted))]">
                  <tr>
                    <th className="px-3 py-2">Poster</th>
                    <th className="px-3 py-2">Başlık</th>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Kaynak</th>
                    <th className="px-3 py-2">URL</th>
                    <th className="px-3 py-2">Hak</th>
                    <th className="px-3 py-2">Depolama</th>
                    <th className="px-3 py-2">Oynatma</th>
                    <th className="px-3 py-2">Boyut</th>
                    <th className="px-3 py-2">Süre</th>
                    <th className="px-3 py-2">Hash</th>
                    <th className="px-3 py-2">Tarih</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-[rgb(var(--color-border))]">
                      <td className="px-3 py-2">
                        <div className="h-12 w-20 overflow-hidden rounded bg-[rgb(var(--color-surface))]">
                          {item.posterPublicUrl || item.thumbnailUrl ? (
                            <img src={item.posterPublicUrl || item.thumbnailUrl || ''} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <Play className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-medium">{item.title || item.normalizedUrl}</td>
                      <td className="px-3 py-2">{platformLabel(item.platform)}</td>
                      <td className="px-3 py-2 text-xs">{item.sourceName || item.sourceUsername || '—'}</td>
                      <td className="max-w-[12rem] truncate px-3 py-2 text-[11px]">{item.originalUrl}</td>
                      <td className="px-3 py-2 text-xs">{rightsLabel(item.rightsStatus)}</td>
                      <td className="px-3 py-2 text-xs">{item.originalStorageKey ? 'R2 original' : 'yok'}</td>
                      <td className="px-3 py-2 text-xs">{statusLabel(item.status)}</td>
                      <td className="px-3 py-2 text-xs">{formatBytes(item.fileSizeBytes)}</td>
                      <td className="px-3 py-2">{formatDuration(item.durationMs)}</td>
                      <td className="px-3 py-2 text-xs">{item.contentHash ? 'var' : 'yok'}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatWhen(item.createdAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs"
                          >
                            ÖNİZLE
                          </button>
                          <a
                            href={item.originalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1 text-xs"
                          >
                            <ExternalLink className="h-3 w-3" /> KAYNAĞA GİT
                          </a>
                          {canCreate && importEnabled && (item.status === 'INSPECTED' || item.status === 'FAILED') ? (
                            <button
                              type="button"
                              onClick={() => void enqueueImport(item.id)}
                              disabled={importingId === item.id}
                              className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              {importingId === item.id ? 'Kuyruk…' : 'TEKRAR DENE'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewItem ? (
              <div className="mt-4 rounded-2xl border border-[rgb(var(--color-border))] p-4">
                <p className="text-sm font-semibold">{previewItem.title || previewItem.normalizedUrl}</p>
                {previewItem.playbackPublicUrl ? (
                  <video
                    className="mt-3 max-h-80 w-full rounded bg-black"
                    controls
                    playsInline
                    preload="metadata"
                    poster={previewItem.posterPublicUrl ?? undefined}
                    src={previewItem.playbackPublicUrl}
                  />
                ) : previewItem.thumbnailUrl ? (
                  <img src={previewItem.thumbnailUrl} alt="" className="mt-3 max-h-64 rounded" />
                ) : (
                  <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">Oynatma dosyası henüz yok.</p>
                )}
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {tab === 'queue' ? (
        jobsError ? (
          <AdminOsErrorState description={jobsError} onRetry={() => void loadJobs()} />
        ) : jobsLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-[rgb(var(--color-surface))]" />
        ) : jobs.length === 0 ? (
          <AdminOsEmptyState
            icon={Clock}
            title="Kuyruk boş"
            description="Seçilen desteklenen URL’ler burada QUEUED / RUNNING / SUCCEEDED / FAILED olarak görünür."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[rgb(var(--color-surface))] text-xs uppercase text-[rgb(var(--color-muted))]">
                <tr>
                  <th className="px-3 py-2">Öğe</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Kaynak URL</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Deneme</th>
                  <th className="px-3 py-2">createdAt</th>
                  <th className="px-3 py-2">startedAt</th>
                  <th className="px-3 py-2">finishedAt</th>
                  <th className="px-3 py-2">Hata</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-[rgb(var(--color-border))]">
                    <td className="px-3 py-2">{job.title || job.itemId}</td>
                    <td className="px-3 py-2">{platformLabel(job.platform)}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-[11px]">
                      {job.sourceUrl || job.originalUrl || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold">{statusLabel(job.status)}</td>
                    <td className="px-3 py-2">{job.attempts}</td>
                    <td className="px-3 py-2 text-xs">{formatWhen(job.createdAt)}</td>
                    <td className="px-3 py-2 text-xs">{formatWhen(job.startedAt)}</td>
                    <td className="px-3 py-2 text-xs">{formatWhen(job.finishedAt)}</td>
                    <td className="px-3 py-2 text-xs text-red-700">
                      {job.errorCode ? `${job.errorCode}: ${job.lastError ?? ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </AdminOsPageShell>
  )
}
