'use client'

import { auth } from '@/lib/firebase/auth'
import { useEffect, useState, useCallback } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import {
  Clock, Play, CheckCircle2, XCircle, Loader2, AlertTriangle, Activity, Timer, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, format } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'

interface CronRun {
  id: string
  jobName: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  startedAt: number | string
  finishedAt?: number | string | null
  durationMs?: number | null
  itemsProcessed?: number | null
  error?: string | null
  triggeredBy?: 'schedule' | 'manual' | string
}

const JOBS = [
  { id: 'news-fetch', label: 'Haber Çekme', desc: 'Breaking + gündem RSS → kuyruk işle', schedule: 'Manuel / 15 dk', icon: '📰' },
  { id: 'process-queue', label: 'Kuyruk İşle', desc: 'Bekleyen haberleri AI ile yazıp yayınla', schedule: 'Her 5 dk', icon: '⚙️' },
  { id: 'draft-reprocess', label: 'Taslak AI Yeniden', desc: 'Onay kuyruğundaki taslakları yeniden yaz/yayınla', schedule: 'Her 10 dk', icon: '✍️' },
  { id: 'breaking', label: 'Son Dakika RSS', desc: 'Breaking kaynaklarını çeker', schedule: 'Her 15 dk', icon: '⚡' },
  { id: 'gundem', label: 'Gündem RSS', desc: 'Ulusal gündem kaynakları', schedule: 'Her 20 dk', icon: '🗞️' },
  { id: 'local', label: 'Yerel RSS', desc: 'Yerel haber kaynakları', schedule: 'Saatte 1', icon: '📍' },
  { id: 'ai-rewrite', label: 'AI Yeniden Yazma', desc: 'Kuyruktaki bekleyenleri işle', schedule: 'Her 5 dk', icon: '🤖' },
  { id: 'trending-update', label: 'Trend Güncelleme', desc: 'Trend haber skorları', schedule: 'Cron', icon: '📈' },
  { id: 'seo-generate', label: 'SEO Üretimi', desc: 'SEO eksik haberlere meta', schedule: 'Cron', icon: '🔍' },
  { id: 'video-sync', label: 'Video Senkron', desc: 'Video kuyruğu', schedule: 'Cron', icon: '🎬' },
  { id: 'cleanup', label: 'Breaking Expire', desc: 'Eski breaking bayraklarını temizle', schedule: 'Cron', icon: '🗑️' },
]

const STATUS_CONFIG = {
  running: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: Loader2, label: 'Çalışıyor', spin: true },
  success: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: CheckCircle2, label: 'Başarılı', spin: false },
  failed: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', icon: XCircle, label: 'Hata', spin: false },
  skipped: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: AlertTriangle, label: 'Atlandı', spin: false },
}

function toMs(v: number | string | null | undefined): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  const n = Date.parse(v)
  return Number.isFinite(n) ? n : null
}

export default function CronMonitorPage() {
  const [runs, setRuns] = useState<CronRun[]>([])
  const [queuePending, setQueuePending] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [flushing, setFlushing] = useState(false)

  const load = useCallback(async () => {
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      if (!token) {
        setLoading(false)
        return
      }
      const res = await fetch('/api/admin/cron/runs', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as {
        runs?: CronRun[]
        queuePending?: number
        error?: string
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setRuns(data.runs ?? [])
      setQueuePending(typeof data.queuePending === 'number' ? data.queuePending : null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cron kayıtları yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 20_000)
    return () => clearInterval(t)
  }, [load])

  const cleanupStuck = async () => {
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/cron/runs?cleanupStuck=1', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { cleaned?: number; error?: string }
      if (!res.ok) throw new Error(data.error || 'Temizlik başarısız')
      toast.success(`${data.cleaned ?? 0} takılı çalışma temizlendi`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Temizlik hatası')
    }
  }

  const flushAllPending = async () => {
    if (flushing) return
    const ok = window.confirm(
      'Tüm bekleyen kuyruk işlenecek, taslaklar AI ile yeniden denenecek ve kalan onay kuyruğu yayınlanacak.\n\nDevam?'
    )
    if (!ok) return
    setFlushing(true)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch('/api/admin/newsroom/flush-pending', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approveDrafts: true,
          reprocessDrafts: true,
          minConfidence: 0,
          maxRounds: 15,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(data.message || 'Bekleyenler işlendi')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Toplu işlem başarısız')
    } finally {
      setFlushing(false)
    }
  }

  const triggerJob = async (jobId: string) => {
    if (triggering) return
    setTriggering(jobId)
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? ''
      const res = await fetch(`/api/admin/cron/trigger?job=${jobId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as { success?: boolean; error?: string; durationMs?: number }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(
        data.success
          ? `Tamamlandı (${data.durationMs ?? 0}ms)`
          : `Bitti ama hata var: ${data.error || 'bak log'}`
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cron tetiklenemedi')
      await load()
    } finally {
      setTriggering(null)
    }
  }

  const jobRuns = (jobId: string) =>
    runs.filter((r) => r.jobName === jobId || (jobId === 'news-fetch' && ['breaking', 'gundem', 'ingest'].includes(r.jobName)))
  const lastRun = (jobId: string) => jobRuns(jobId)[0]
  const filteredRuns = selectedJob
    ? runs.filter(
        (r) =>
          r.jobName === selectedJob ||
          (selectedJob === 'news-fetch' && ['breaking', 'gundem', 'ingest', 'news-fetch'].includes(r.jobName))
      )
    : runs

  const stats = {
    total: runs.length,
    success: runs.filter((r) => r.status === 'success').length,
    failed: runs.filter((r) => r.status === 'failed').length,
    running: runs.filter((r) => r.status === 'running').length,
  }

  return (
    <div className="flex flex-col">
      <CMSHeader title="Cron İzleme" subtitle="Zamanlanmış görev monitörü" />
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </button>
          <button
            type="button"
            onClick={() => void cleanupStuck()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold"
          >
            Takılıları temizle
          </button>
          <button
            type="button"
            disabled={flushing || triggering != null}
            onClick={() => void flushAllPending()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {flushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Tek tuş: Tüm bekleyenleri yayınla
          </button>
          {queuePending != null && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              Kuyruk bekleyen: {queuePending}+
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Toplam Çalışma', value: stats.total, color: 'text-[rgb(var(--color-text))]' },
            { label: 'Başarılı', value: stats.success, color: 'text-emerald-600' },
            { label: 'Hatalı', value: stats.failed, color: 'text-red-600' },
            { label: 'Şu An Çalışan', value: stats.running, color: 'text-blue-600' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                {s.label}
              </p>
              <p className={cn('mt-1 text-2xl font-black tabular-nums', s.color)}>
                {loading ? '–' : s.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-3 xl:col-span-1">
            <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Görevler</h2>
            {JOBS.map((job) => {
              const last = lastRun(job.id)
              const cfg = last ? STATUS_CONFIG[last.status] : null
              const Icon = cfg?.icon ?? Clock
              const finished = toMs(last?.finishedAt)
              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
                  className={cn(
                    'cursor-pointer rounded-xl border bg-[rgb(var(--color-card))] p-4 transition-all hover:shadow-md',
                    selectedJob === job.id
                      ? 'border-blue-500 ring-1 ring-blue-500'
                      : 'border-[rgb(var(--color-border))]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{job.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[rgb(var(--color-text))]">{job.label}</p>
                        {cfg && (
                          <span
                            className={cn(
                              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                              cfg.bg,
                              cfg.color
                            )}
                          >
                            <Icon className={cn('h-2.5 w-2.5', cfg.spin && 'animate-spin')} />
                            {cfg.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[rgb(var(--color-muted))]">{job.schedule}</p>
                      {finished && (
                        <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
                          Son:{' '}
                          {formatDistanceToNow(new Date(finished), { locale: tr, addSuffix: true })}
                          {last?.durationMs ? ` · ${last.durationMs}ms` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void triggerJob(job.id)
                      }}
                      disabled={triggering === job.id || last?.status === 'running'}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      title="Manuel Tetikle"
                    >
                      {triggering === job.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] xl:col-span-2">
            <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">
                  {selectedJob ? JOBS.find((j) => j.id === selectedJob)?.label : 'Tüm'} Çalışmaları
                </h2>
              </div>
              {selectedJob && (
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Tümünü Göster
                </button>
              )}
            </div>
            <div className="max-h-[600px] divide-y divide-[rgb(var(--color-border))] overflow-y-auto">
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />
                  ))}
                </div>
              ) : filteredRuns.length === 0 ? (
                <div className="py-16 text-center text-sm text-[rgb(var(--color-muted))]">
                  Henüz kayıt yok. Cronları tetiklemek için ▶ düğmesine tıklayın.
                </div>
              ) : (
                filteredRuns.map((run) => {
                  const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.failed
                  const Icon = cfg.icon
                  const jobLabel = JOBS.find((j) => j.id === run.jobName)?.label ?? run.jobName
                  const started = toMs(run.startedAt)
                  return (
                    <div
                      key={run.id}
                      className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]"
                    >
                      <div
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                          cfg.bg
                        )}
                      >
                        <Icon className={cn('h-3 w-3', cfg.color, cfg.spin && 'animate-spin')} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-bold text-[rgb(var(--color-text))]">{jobLabel}</p>
                          {run.triggeredBy === 'manual' && (
                            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                              MANUEL
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex gap-3 text-[10px] text-[rgb(var(--color-muted))]">
                          {started && (
                            <span>{format(new Date(started), 'dd MMM HH:mm:ss', { locale: tr })}</span>
                          )}
                          {run.durationMs != null && (
                            <span className="flex items-center gap-0.5">
                              <Timer className="h-2.5 w-2.5" />
                              {run.durationMs}ms
                            </span>
                          )}
                        </div>
                        {run.error && (
                          <p className="mt-1 font-mono text-[10px] text-red-500">{run.error}</p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
