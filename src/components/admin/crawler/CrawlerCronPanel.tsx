'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth } from '@/lib/firebase/auth'
import type { CronJobSummary } from '@/services/crawler/ops/cronSummary'

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
  const [jobs, setJobs] = useState<CronJobSummary[]>([])
  const [history, setHistory] = useState<{ last24h: number; last7d: number }>({ last24h: 0, last7d: 0 })
  const [enabled, setEnabled] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/crawler/cron-summary', { headers: await authHeaders() })
      if (!res.ok) return
      const body = (await res.json()) as {
        jobs?: CronJobSummary[]
        history?: { last24h: number; last7d: number }
        crawlerEnabled?: boolean
      }
      setJobs(body.jobs || [])
      if (body.history) setHistory(body.history)
      setEnabled(Boolean(body.crawlerEnabled))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--color-border))] px-4 py-3">
        <h2 className="text-sm font-bold">Crawler görevleri</h2>
        <p className="text-xs text-[rgb(var(--color-muted))]">
          {enabled ? 'Aktif' : 'Devre Dışı'} · 24s {history.last24h} · 7g {history.last7d} · özet tablosu, ek polling yok
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-[rgb(var(--color-muted))]">
              <th className="px-3 py-2">Görev</th>
              <th className="px-3 py-2">Son çalışma</th>
              <th className="px-3 py-2">Son başarılı</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Süre</th>
              <th className="px-3 py-2">İşlenen</th>
              <th className="px-3 py-2">Başarılı</th>
              <th className="px-3 py-2">Atlanan</th>
              <th className="px-3 py-2">Hatalı</th>
              <th className="px-3 py-2">Sonraki</th>
              <th className="px-3 py-2">Trigger</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.name} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-3 py-2 font-semibold">{job.name}</td>
                <td className="px-3 py-2">{fmtDate(job.lastRunAt)}</td>
                <td className="px-3 py-2">{fmtDate(job.lastSuccessAt)}</td>
                <td className="px-3 py-2">{job.status}</td>
                <td className="px-3 py-2">{job.durationMs != null ? `${job.durationMs} ms` : '—'}</td>
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
