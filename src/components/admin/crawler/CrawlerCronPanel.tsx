'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { auth } from '@/lib/firebase/auth'
import { loadAdminJson } from '@/lib/adminApiError'
import type { CronJobSummary, CronLane } from '@/services/crawler/ops/cronSummary'
import { CRON_LANE_EXPLAIN, CRON_LANE_ORDER } from '@/services/crawler/ops/cronSummary'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fmtDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR')
}

export function CrawlerCronPanel() {
  const [jobs, setJobs] = useState<CronJobSummary[] | null>(null)
  const [lanes, setLanes] = useState<Array<{ lane: CronLane; explanation: string }>>([])
  const [history, setHistory] = useState<{ last24h: number; last7d: number } | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [laneFilter, setLaneFilter] = useState<CronLane | 'ALL'>('ALL')

  const load = useCallback(async () => {
    const result = await loadAdminJson<{
      jobs?: CronJobSummary[]
      history?: { last24h: number; last7d: number }
      crawlerEnabled?: boolean
      lanes?: Array<{ lane: CronLane; explanation: string }>
      error?: string
    }>('/api/admin/crawler/cron-summary', { headers: await authHeaders() })
    if (!result.ok) {
      setError(result.error)
      setJobs(null)
      setHistory(null)
      return
    }
    setError(null)
    setJobs(result.data.jobs || [])
    if (result.data.history) setHistory(result.data.history)
    setEnabled(Boolean(result.data.crawlerEnabled))
    setLanes(result.data.lanes || CRON_LANE_ORDER.map((lane) => ({ lane, explanation: CRON_LANE_EXPLAIN[lane] })))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    if (!jobs) return []
    if (laneFilter === 'ALL') return jobs
    return jobs.filter((j) => j.lane === laneFilter)
  }, [jobs, laneFilter])

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Cron İzleme</h2>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Hatlar: CRAWLER · RSS RADAR · LEGACY · AI DISPATCH. Boşta ≠ bozuk.
          </p>
        </div>
        <p className="text-xs text-[rgb(var(--color-muted))]">
          {enabled ? 'Crawler Aktif' : 'Crawler Devre Dışı'}
          {history ? ` · 24s ${history.last24h} · 7g ${history.last7d}` : ''} · özet tablosu, ek polling yok
        </p>
      </div>
      {error ? (
        <p className="px-4 py-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 border-b border-[rgb(var(--color-border))] px-4 py-2">
        <button
          type="button"
          className={`rounded-lg px-2 py-1 text-xs ${laneFilter === 'ALL' ? 'bg-[rgb(var(--color-brand))] text-white' : 'border'}`}
          onClick={() => setLaneFilter('ALL')}
        >
          Tümü
        </button>
        {CRON_LANE_ORDER.map((lane) => (
          <button
            key={lane}
            type="button"
            title={CRON_LANE_EXPLAIN[lane]}
            className={`rounded-lg px-2 py-1 text-xs ${laneFilter === lane ? 'bg-[rgb(var(--color-brand))] text-white' : 'border'}`}
            onClick={() => setLaneFilter(lane)}
          >
            {lane}
          </button>
        ))}
      </div>
      {lanes.length ? (
        <ul className="grid gap-1 px-4 py-2 text-[11px] text-[rgb(var(--color-muted))] md:grid-cols-2">
          {lanes.map((l) => (
            <li key={l.lane}>
              <span className="font-semibold text-[rgb(var(--color-fg))]">{l.lane}:</span> {l.explanation}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-[rgb(var(--color-muted))]">
              <th className="px-3 py-2">Hat</th>
              <th className="px-3 py-2">Görev</th>
              <th className="px-3 py-2">Son çalışma</th>
              <th className="px-3 py-2">Son başarılı</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Not</th>
              <th className="px-3 py-2">İşlenen</th>
              <th className="px-3 py-2">Başarılı</th>
              <th className="px-3 py-2">Atlanan</th>
              <th className="px-3 py-2">Hatalı</th>
              <th className="px-3 py-2">Sonraki</th>
              <th className="px-3 py-2">Trigger</th>
            </tr>
          </thead>
          <tbody>
            {jobs === null && !error ? (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-[rgb(var(--color-muted))]">
                  Yükleniyor…
                </td>
              </tr>
            ) : null}
            {visible.map((job) => (
              <tr key={job.name} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-3 py-2 font-semibold">{job.lane}</td>
                <td className="px-3 py-2">{job.name}</td>
                <td className="px-3 py-2">{fmtDate(job.lastRunAt)}</td>
                <td className="px-3 py-2">{fmtDate(job.lastSuccessAt)}</td>
                <td className="px-3 py-2">{job.status}</td>
                <td className="max-w-[220px] px-3 py-2 text-[rgb(var(--color-muted))]">{job.idleNote || '—'}</td>
                <td className="px-3 py-2">{job.processed}</td>
                <td className="px-3 py-2">{job.success}</td>
                <td className="px-3 py-2">{job.skipped}</td>
                <td className="px-3 py-2">{job.failed}</td>
                <td className="px-3 py-2">{job.nextRunHint}</td>
                <td className="px-3 py-2">{job.trigger}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
