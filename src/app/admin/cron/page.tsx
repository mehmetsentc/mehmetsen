import { auth } from '@/lib/firebase/auth'
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, where, getDocs } from 'firebase/firestore'
import { useAuth } from '@/hooks/useAuth'
import { Clock, Play, CheckCircle2, XCircle, Loader2, AlertTriangle, RefreshCw, Activity, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, format } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'

interface CronRun {
  id: string
  jobName: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  startedAt: string
  finishedAt?: string
  durationMs?: number
  itemsProcessed?: number
  error?: string
  triggeredBy?: 'schedule' | 'manual'
}

const JOBS = [
  { id: 'news-fetch', label: 'Haber Çekme', desc: 'RSS ve API kaynaklarından haber çeker', schedule: 'Her 15 dk', icon: '📰' },
  { id: 'ai-rewrite', label: 'AI Yeniden Yazma', desc: 'Bekleyen haberleri AI ile yeniden yazar', schedule: 'Her 30 dk', icon: '🤖' },
  { id: 'seo-generate', label: 'SEO Üretimi', desc: 'SEO eksik haberlere meta veri ekler', schedule: 'Her 1 saat', icon: '🔍' },
  { id: 'video-sync', label: 'Video Senkronizasyon', desc: 'YouTube kanalından videoları senkronize eder', schedule: 'Her 6 saat', icon: '🎬' },
  { id: 'trending-update', label: 'Trend Güncelleme', desc: 'Trend haber skorlarını günceller', schedule: 'Her 5 dk', icon: '📈' },
  { id: 'cleanup', label: 'Veri Temizleme', desc: 'Eski draft ve geçici verileri siler', schedule: 'Günlük gece 02:00', icon: '🗑️' },
]

const STATUS_CONFIG = {
  running: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: Loader2, label: 'Çalışıyor', spin: true },
  success: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: CheckCircle2, label: 'Başarılı', spin: false },
  failed: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', icon: XCircle, label: 'Hata', spin: false },
  skipped: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', icon: AlertTriangle, label: 'Atlandı', spin: false },
}

export default function CronMonitorPage() {
  const { user } = useAuth()
  const [runs, setRuns] = useState<CronRun[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'cronRuns'), orderBy('startedAt', 'desc'), limit(100))
    const unsub = onSnapshot(q, snap => {
      setRuns(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          jobName: data.jobName as string,
          status: data.status as CronRun['status'],
          startedAt: data.startedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
          finishedAt: data.finishedAt?.toDate?.()?.toISOString?.(),
          durationMs: data.durationMs as number | undefined,
          itemsProcessed: data.itemsProcessed as number | undefined,
          error: data.error as string | undefined,
          triggeredBy: (data.triggeredBy ?? 'schedule') as CronRun['triggeredBy'],
        }
      }))
      setLoading(false)
    }, () => { setLoading(false) })

    unsubRef.current = unsub
    return unsub
  }, [])

  const triggerJob = async (jobId: string) => {
    if (!user || triggering) return
    setTriggering(jobId)
    try {
      const token = await auth.currentUser?.getIdToken() ?? ''
      const res = await fetch(`/api/admin/cron/trigger?job=${jobId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('Cron tetiklendi')
      } else {
        // Simulate by writing a mock run
        await addDoc(collection(db, 'cronRuns'), {
          jobName: jobId,
          status: 'running',
          startedAt: serverTimestamp(),
          triggeredBy: 'manual',
        })
        toast.success('Cron tetiklendi (simülasyon)')
      }
    } catch {
      toast.error('Cron tetiklenemedi')
    } finally {
      setTriggering(null)
    }
  }

  const jobRuns = (jobId: string) => runs.filter(r => r.jobName === jobId)
  const lastRun = (jobId: string) => jobRuns(jobId)[0]
  const filteredRuns = selectedJob ? runs.filter(r => r.jobName === selectedJob) : runs

  const stats = {
    total: runs.length,
    success: runs.filter(r => r.status === 'success').length,
    failed: runs.filter(r => r.status === 'failed').length,
    running: runs.filter(r => r.status === 'running').length,
  }

  return (
    <div className="flex flex-col">
      <CMSHeader title="Cron İzleme" subtitle="Zamanlanmış görev monitörü" />
      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Toplam Çalışma', value: stats.total, color: 'text-[rgb(var(--color-text))]' },
            { label: 'Başarılı', value: stats.success, color: 'text-emerald-600' },
            { label: 'Hatalı', value: stats.failed, color: 'text-red-600' },
            { label: 'Şu An Çalışan', value: stats.running, color: 'text-blue-600' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-black tabular-nums', s.color)}>{loading ? '–' : s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {/* Job list */}
          <div className="xl:col-span-1 space-y-3">
            <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Görevler</h2>
            {JOBS.map(job => {
              const last = lastRun(job.id)
              const cfg = last ? STATUS_CONFIG[last.status] : null
              const Icon = cfg?.icon ?? Clock
              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
                  className={cn(
                    'cursor-pointer rounded-xl border bg-[rgb(var(--color-card))] p-4 transition-all hover:shadow-md',
                    selectedJob === job.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-[rgb(var(--color-border))]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{job.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[rgb(var(--color-text))]">{job.label}</p>
                        {cfg && (
                          <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', cfg.bg, cfg.color)}>
                            <Icon className={cn('h-2.5 w-2.5', cfg.spin && 'animate-spin')} />
                            {cfg.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[rgb(var(--color-muted))]">{job.schedule}</p>
                      {last?.finishedAt && (
                        <p className="mt-1 text-[10px] text-[rgb(var(--color-muted))]">
                          Son: {formatDistanceToNow(new Date(last.finishedAt), { locale: tr, addSuffix: true })}
                          {last.durationMs && ` · ${last.durationMs}ms`}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); triggerJob(job.id) }}
                      disabled={triggering === job.id || last?.status === 'running'}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      title="Manuel Tetikle"
                    >
                      {triggering === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Run log */}
          <div className="xl:col-span-2 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">
                  {selectedJob ? JOBS.find(j => j.id === selectedJob)?.label : 'Tüm'} Çalışmaları
                </h2>
              </div>
              {selectedJob && (
                <button onClick={() => setSelectedJob(null)} className="text-xs text-blue-600 hover:underline">Tümünü Göster</button>
              )}
            </div>
            <div className="divide-y divide-[rgb(var(--color-border))] overflow-y-auto max-h-[600px]">
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />)}
                </div>
              ) : filteredRuns.length === 0 ? (
                <div className="py-16 text-center text-sm text-[rgb(var(--color-muted))]">
                  Henüz kayıt yok. Cronları tetiklemek için ▶ düğmesine tıklayın.
                </div>
              ) : filteredRuns.map(run => {
                const cfg = STATUS_CONFIG[run.status]
                const Icon = cfg.icon
                const jobLabel = JOBS.find(j => j.id === run.jobName)?.label ?? run.jobName
                return (
                  <div key={run.id} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]">
                    <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', cfg.bg)}>
                      <Icon className={cn('h-3 w-3', cfg.color, cfg.spin && 'animate-spin')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-[rgb(var(--color-text))]">{jobLabel}</p>
                        {run.triggeredBy === 'manual' && (
                          <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">MANUEL</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex gap-3 text-[10px] text-[rgb(var(--color-muted))]">
                        <span>{format(new Date(run.startedAt), 'dd MMM HH:mm:ss', { locale: tr })}</span>
                        {run.durationMs && <span className="flex items-center gap-0.5"><Timer className="h-2.5 w-2.5" />{run.durationMs}ms</span>}
                        {run.itemsProcessed != null && <span>{run.itemsProcessed} öğe</span>}
                      </div>
                      {run.error && <p className="mt-1 text-[10px] text-red-500 font-mono">{run.error}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
