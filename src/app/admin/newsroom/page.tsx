'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { auth } from '@/lib/firebase/auth'
import { useAuth } from '@/hooks/useAuth'
import {
  Bot, Cpu, Zap, BrainCircuit, CheckCircle2, XCircle,
  Clock, AlertTriangle, RefreshCw, Play, RotateCcw,
  Activity, FileText, Layers, TrendingUp, Loader2,
  ChevronRight, Circle, Square, BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────
interface AgentStatus {
  id: string; name: string; role: string
  configured: boolean; ok: boolean; latencyMs: number; error?: string
}
interface QueueStats { pending: number; processing: number; done: number; failed: number; rejected: number }
interface StatusData { timestamp: number; agents: Record<string, AgentStatus>; queue: QueueStats }

interface QueueItem {
  id: string; status: string; priority: number
  originalTitle: string; sourceLabel: string
  createdAt: number; updatedAt: number
  retryCount: number; finalNewsId?: string
  geminiQuality?: number; gptDecision?: string; gptScore?: number
  errorLog?: string[]
}

interface LogEntry {
  id: string; level: string; agent: string
  message: string; timestamp: number; durationMs?: number
}

type TabId = 'overview' | 'queue' | 'logs' | 'pipeline'

// ── Helpers ───────────────────────────────────────────────────────────────────
const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  gemini: BrainCircuit,
  deepseek: Cpu,
  gpt: Bot,
  claude: Zap,
}

const AGENT_COLORS: Record<string, string> = {
  gemini: 'text-blue-400',
  deepseek: 'text-purple-400',
  gpt: 'text-emerald-400',
  claude: 'text-orange-400',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-300',
  processing: 'bg-blue-500/20 text-blue-300',
  done: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-red-500/20 text-red-300',
  rejected: 'bg-slate-500/20 text-slate-400',
  approved: 'bg-emerald-500/20 text-emerald-300',
  needs_revision: 'bg-amber-500/20 text-amber-300',
}

const LOG_COLORS: Record<string, string> = {
  info: 'text-sky-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-slate-500',
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function NewsroomPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<TabId>('overview')
  const [status, setStatus] = useState<StatusData | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [queueFilter, setQueueFilter] = useState<string>('all')
  const [logFilter, setLogFilter] = useState<string>('all')
  const [loading, setLoading] = useState({ status: true, queue: false, logs: false })
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch status ────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/ai/status', { headers })
      if (res.ok) setStatus(await res.json() as StatusData)
    } catch { /* silent */ }
    finally { setLoading(p => ({ ...p, status: false })) }
  }, [])

  // ── Fetch queue ─────────────────────────────────────────────────────────────
  const fetchQueue = useCallback(async (statusFilter?: string) => {
    setLoading(p => ({ ...p, queue: true }))
    try {
      const headers = await getAuthHeader()
      const qs = statusFilter && statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/ai/queue${qs}`, { headers })
      if (res.ok) {
        const data = await res.json() as { items: QueueItem[] }
        setQueue(data.items)
      }
    } catch { /* silent */ }
    finally { setLoading(p => ({ ...p, queue: false })) }
  }, [])

  // ── Fetch logs ──────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async (level?: string) => {
    setLoading(p => ({ ...p, logs: true }))
    try {
      const headers = await getAuthHeader()
      const qs = level && level !== 'all' ? `?level=${level}` : ''
      const res = await fetch(`/api/ai/logs${qs}`, { headers })
      if (res.ok) {
        const data = await res.json() as { logs: LogEntry[] }
        setLogs(data.logs)
      }
    } catch { /* silent */ }
    finally { setLoading(p => ({ ...p, logs: false })) }
  }, [])

  // ── Auto-refresh status every 30s ───────────────────────────────────────────
  useEffect(() => {
    void fetchStatus()
    intervalRef.current = setInterval(() => void fetchStatus(), 30_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchStatus])

  // ── Fetch on tab change ─────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'queue') void fetchQueue(queueFilter)
    if (tab === 'logs') void fetchLogs(logFilter)
  }, [tab, fetchQueue, fetchLogs, queueFilter, logFilter])

  // ── Run pipeline ────────────────────────────────────────────────────────────
  const runPipeline = async () => {
    if (running) return
    setRunning(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/ai/pipeline', { method: 'POST', headers })
      const data = await res.json() as { processed?: number; published?: number; rejected?: number; failed?: number }
      if (res.ok) {
        toast.success(`Pipeline tamamlandı — ${data.processed ?? 0} işlendi, ${data.published ?? 0} yayınlandı`)
        await fetchStatus()
        if (tab === 'queue') await fetchQueue(queueFilter)
      } else {
        toast.error('Pipeline hatası')
      }
    } catch { toast.error('Pipeline çalıştırılamadı') }
    finally { setRunning(false) }
  }

  // ── Retry queue item ────────────────────────────────────────────────────────
  const retryItem = async (id: string) => {
    try {
      const headers = await getAuthHeader()
      await fetch('/api/ai/queue', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'retry' }),
      })
      toast.success('Tekrar kuyruğa eklendi')
      await fetchQueue(queueFilter)
    } catch { toast.error('Hata') }
  }

  // ── Computed stats ──────────────────────────────────────────────────────────
  const agents = status ? Object.values(status.agents) : []
  const onlineCount = agents.filter(a => a.ok).length
  const q = status?.queue ?? { pending: 0, processing: 0, done: 0, failed: 0, rejected: 0 }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[rgb(var(--color-bg))]">
      <CMSHeader title="AI Newsroom" />

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 lg:px-8">

        {/* ── Top stats ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: 'AI Agent', value: `${onlineCount}/4`, icon: Bot, color: 'text-blue-400' },
            { label: 'Kuyrukta', value: q.pending, icon: Clock, color: 'text-amber-400' },
            { label: 'İşleniyor', value: q.processing, icon: Activity, color: 'text-blue-400' },
            { label: 'Yayınlandı', value: q.done, icon: CheckCircle2, color: 'text-emerald-400' },
            { label: 'Başarısız', value: q.failed, icon: XCircle, color: 'text-red-400' },
            { label: 'Reddedildi', value: q.rejected, icon: AlertTriangle, color: 'text-slate-400' },
          ].map(s => {
            const Icon = s.icon
            return (
              <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[rgb(var(--color-muted))]">{s.label}</p>
                  <Icon className={cn('h-3.5 w-3.5', s.color)} />
                </div>
                <p className={cn('mt-1 text-2xl font-bold', s.color)}>{s.value}</p>
              </div>
            )
          })}
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {(['overview', 'queue', 'logs', 'pipeline'] as TabId[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  tab === t
                    ? 'bg-[rgb(var(--color-brand))] text-white'
                    : 'bg-white/10 text-[rgb(var(--color-muted))] hover:bg-white/15 hover:text-white'
                )}
              >
                {t === 'overview' ? 'Genel Bakış' : t === 'queue' ? 'Kuyruk' : t === 'logs' ? 'Loglar' : 'Pipeline'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { void fetchStatus(); if (tab === 'queue') void fetchQueue(queueFilter); if (tab === 'logs') void fetchLogs(logFilter) }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
            >
              <RefreshCw className="h-3 w-3" />
              Yenile
            </button>
            <button
              onClick={() => void runPipeline()}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Pipeline Çalıştır
            </button>
          </div>
        </div>

        {/* ── Overview Tab ─────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* Agent cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(loading.status ? [
                { id: 'gemini', name: 'Gemini 2.5 Flash', role: 'Chief News Editor', configured: false, ok: false, latencyMs: 0 },
                { id: 'deepseek', name: 'DeepSeek V3', role: 'News Generator', configured: false, ok: false, latencyMs: 0 },
                { id: 'gpt', name: 'GPT-4o', role: 'Senior Editor', configured: false, ok: false, latencyMs: 0 },
                { id: 'claude', name: 'Claude Haiku', role: 'Technical AI', configured: false, ok: false, latencyMs: 0 },
              ] : agents).map(agent => {
                const Icon = AGENT_ICONS[agent.id] ?? Bot
                return (
                  <div key={agent.id} className={cn(
                    'rounded-xl border p-4 transition-all',
                    agent.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/5'
                  )}>
                    <div className="flex items-start justify-between">
                      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-white/10', AGENT_COLORS[agent.id])}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                        agent.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      )}>
                        <Circle className={cn('h-1.5 w-1.5 fill-current', agent.ok ? 'text-emerald-400' : 'text-red-400')} />
                        {agent.ok ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="mt-3">
                      <p className="text-sm font-bold text-white">{agent.name}</p>
                      <p className="text-[11px] text-[rgb(var(--color-muted))]">{agent.role}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-[rgb(var(--color-muted))]">
                      <span>{agent.configured ? '✓ Yapılandırıldı' : '✗ API Key eksik'}</span>
                      {agent.latencyMs > 0 && <span>{agent.latencyMs}ms</span>}
                    </div>
                    {agent.error && (
                      <p className="mt-1 truncate text-[10px] text-red-400">{agent.error}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Pipeline flow diagram */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[rgb(var(--color-muted))]">Pipeline Akışı</p>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: 'Kaynak RSS', color: 'bg-slate-700' },
                  { label: 'DeepSeek', sub: 'Collector', color: 'bg-purple-900/50 border-purple-500/40' },
                  { label: 'Gemini', sub: 'Editor', color: 'bg-blue-900/50 border-blue-500/40' },
                  { label: 'GPT-4o', sub: 'QA', color: 'bg-emerald-900/50 border-emerald-500/40' },
                  { label: 'Firestore', sub: 'Publish', color: 'bg-orange-900/50 border-orange-500/40' },
                  { label: 'Sosyal Medya', color: 'bg-pink-900/50 border-pink-500/40' },
                ].map((step, i, arr) => (
                  <div key={step.label} className="flex items-center gap-2">
                    <div className={cn('rounded-lg border border-white/10 px-3 py-2 text-center text-xs', step.color)}>
                      <p className="font-bold text-white">{step.label}</p>
                      {step.sub && <p className="text-[10px] text-[rgb(var(--color-muted))]">{step.sub}</p>}
                    </div>
                    {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-[rgb(var(--color-muted))]" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Queue chart */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-[rgb(var(--color-muted))]">Kuyruk Durumu</p>
              <div className="grid grid-cols-5 gap-3 text-center">
                {[
                  { label: 'Bekliyor', value: q.pending, color: 'text-amber-400' },
                  { label: 'İşleniyor', value: q.processing, color: 'text-blue-400' },
                  { label: 'Tamamlandı', value: q.done, color: 'text-emerald-400' },
                  { label: 'Başarısız', value: q.failed, color: 'text-red-400' },
                  { label: 'Reddedildi', value: q.rejected, color: 'text-slate-400' },
                ].map(s => (
                  <div key={s.label}>
                    <p className={cn('text-3xl font-bold', s.color)}>{s.value}</p>
                    <p className="mt-0.5 text-[10px] text-[rgb(var(--color-muted))]">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Queue Tab ─────────────────────────────────────────────────── */}
        {tab === 'queue' && (
          <div className="space-y-3">
            {/* Filter */}
            <div className="flex gap-2">
              {['all', 'pending', 'processing', 'done', 'failed', 'rejected'].map(f => (
                <button key={f} onClick={() => { setQueueFilter(f); void fetchQueue(f) }}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold',
                    queueFilter === f ? 'bg-[rgb(var(--color-brand))] text-white' : 'bg-white/10 text-[rgb(var(--color-muted))] hover:bg-white/15'
                  )}>
                  {f === 'all' ? 'Tümü' : f === 'pending' ? 'Bekliyor' : f === 'processing' ? 'İşleniyor' :
                    f === 'done' ? 'Tamamlandı' : f === 'failed' ? 'Başarısız' : 'Reddedildi'}
                </button>
              ))}
            </div>

            {loading.queue ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" /></div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10 bg-white/5">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-[rgb(var(--color-muted))]">Haber</th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold text-[rgb(var(--color-muted))] sm:table-cell">Kaynak</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[rgb(var(--color-muted))]">Durum</th>
                      <th className="hidden px-4 py-3 text-center text-xs font-semibold text-[rgb(var(--color-muted))] md:table-cell">Gemini</th>
                      <th className="hidden px-4 py-3 text-center text-xs font-semibold text-[rgb(var(--color-muted))] md:table-cell">GPT</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-[rgb(var(--color-muted))]">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {queue.length === 0 ? (
                      <tr><td colSpan={6} className="py-10 text-center text-[rgb(var(--color-muted))]">Kuyruk boş</td></tr>
                    ) : queue.map(item => (
                      <tr key={item.id} className="hover:bg-white/5">
                        <td className="px-4 py-3">
                          <p className="line-clamp-2 text-xs font-medium text-white">{item.originalTitle}</p>
                          <p className="mt-0.5 text-[10px] text-[rgb(var(--color-muted))]">
                            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: tr })}
                          </p>
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-[rgb(var(--color-muted))] sm:table-cell">{item.sourceLabel}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_COLORS[item.status] ?? 'bg-white/10 text-white')}>
                            {item.status}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-center md:table-cell">
                          {item.geminiQuality != null ? (
                            <span className={cn('text-xs font-bold', item.geminiQuality >= 70 ? 'text-emerald-400' : 'text-amber-400')}>
                              {item.geminiQuality}
                            </span>
                          ) : <span className="text-[rgb(var(--color-muted))]">—</span>}
                        </td>
                        <td className="hidden px-4 py-3 text-center md:table-cell">
                          {item.gptDecision ? (
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATUS_COLORS[item.gptDecision] ?? '')}>
                              {item.gptDecision}
                            </span>
                          ) : <span className="text-[rgb(var(--color-muted))]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(item.status === 'failed' || item.status === 'rejected') && (
                            <button onClick={() => void retryItem(item.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] hover:bg-white/15">
                              <RotateCcw className="h-2.5 w-2.5" />
                              Tekrar
                            </button>
                          )}
                          {item.finalNewsId && (
                            <a href={`/admin/news/${item.finalNewsId}/edit`}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/30">
                              <FileText className="h-2.5 w-2.5" />
                              Habere git
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Logs Tab ──────────────────────────────────────────────────── */}
        {tab === 'logs' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {['all', 'info', 'warn', 'error'].map(l => (
                <button key={l} onClick={() => { setLogFilter(l); void fetchLogs(l) }}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold',
                    logFilter === l ? 'bg-[rgb(var(--color-brand))] text-white' : 'bg-white/10 text-[rgb(var(--color-muted))] hover:bg-white/15'
                  )}>
                  {l === 'all' ? 'Tümü' : l === 'info' ? 'Bilgi' : l === 'warn' ? 'Uyarı' : 'Hata'}
                </button>
              ))}
            </div>

            {loading.logs ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[rgb(var(--color-muted))]" /></div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/30 font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="py-10 text-center text-[rgb(var(--color-muted))]">Log bulunamadı</p>
                ) : logs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 border-b border-white/5 px-4 py-2 hover:bg-white/5">
                    <span className={cn('mt-0.5 shrink-0 font-bold uppercase', LOG_COLORS[log.level] ?? 'text-white')}>
                      [{log.level.toUpperCase()}]
                    </span>
                    <span className={cn('shrink-0', AGENT_COLORS[log.agent] ?? 'text-slate-400')}>
                      {log.agent}
                    </span>
                    <span className="flex-1 text-white/80">{log.message}</span>
                    <span className="shrink-0 text-[rgb(var(--color-muted))]">
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true, locale: tr })}
                    </span>
                    {log.durationMs && (
                      <span className="shrink-0 text-[rgb(var(--color-muted))]">{log.durationMs}ms</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pipeline Tab ─────────────────────────────────────────────── */}
        {tab === 'pipeline' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
              <p className="mb-4 text-sm font-semibold text-white">Manuel Pipeline Tetikleyici</p>
              <p className="mb-4 text-xs text-[rgb(var(--color-muted))]">
                Bu buton bekleyen kuyruk öğelerini anında işler (maks. 5 haber/çalışma).
                Kuyruğa haber eklemek için newsroom cron'larından birini tetikleyin.
              </p>
              <button
                onClick={() => void runPipeline()}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--color-brand))] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {running ? 'Çalışıyor...' : 'Pipeline Çalıştır'}
              </button>
            </div>

            {/* Cron schedule info */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[rgb(var(--color-muted))]">Otomatik Cron</p>
              <div className="space-y-2">
                {[
                  { path: '/api/cron/newsroom/ai-pipeline', schedule: 'Her 5 dakika', desc: 'Ana AI pipeline (DeepSeek → Gemini → GPT)' },
                  { path: '/api/cron/social', schedule: 'Her 5 dakika', desc: 'Facebook + Instagram paylaşımı' },
                  { path: '/api/cron/newsroom/ingest', schedule: 'Her 10 dakika', desc: 'RSS kaynak toplama' },
                ].map(cron => (
                  <div key={cron.path} className="flex items-start gap-3 rounded-lg bg-white/5 px-3 py-2">
                    <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <code className="text-[11px] text-emerald-300">{cron.path}</code>
                      <p className="text-[10px] text-[rgb(var(--color-muted))]">{cron.desc}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-[rgb(var(--color-muted))]">
                      {cron.schedule}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
