'use client'

import { useEffect, useState } from 'react'
import { AdminOsEmptyState, AdminOsErrorState, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { TableSkeleton } from '@/components/admin/ui/TableSkeleton'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type Row = Record<string, unknown>
const SECTIONS = [
  { key: 'discoveryFailures', title: 'Keşif hataları' },
  { key: 'httpFailures', title: 'HTTP hataları' },
  { key: 'extractionFailures', title: 'Çıkarım hataları' },
] as const

/** ADMIN-UX-1: readable column names for the known failure fields; unknown fields keep their key. */
const COLUMN_LABEL: Record<string, string> = {
  source: 'Kaynak',
  sourceName: 'Kaynak',
  status: 'Durum',
  consecutiveFailures: 'Ardışık hata',
  lastFailureReason: 'Son neden',
  reason: 'Neden',
  lastHttpStatus: 'HTTP',
  httpStatus: 'HTTP',
  lastFailureAt: 'Son hata',
  lastDiscoveryAt: 'Son keşif',
  url: 'Adres',
}
const PREFERRED = Object.keys(COLUMN_LABEL)

function columnsOf(rows: Row[]): string[] {
  const keys = new Set<string>()
  for (const r of rows.slice(0, 40)) for (const k of Object.keys(r)) keys.add(k)
  const known = PREFERRED.filter((k) => keys.has(k))
  const rest = [...keys].filter((k) => !PREFERRED.includes(k) && !/id$/i.test(k)).slice(0, Math.max(0, 6 - known.length))
  return [...known, ...rest].slice(0, 7)
}

function cell(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80)
  return String(v)
}

export default function CrawlerFailuresPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/crawler/failures', { headers: await authHeaders() })
        const body = await res.json()
        if (!res.ok) setError(body.error || 'Yüklenemedi')
        else setData(body)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Yüklenemedi')
      }
    })()
  }, [])

  return (
    <AdminOsPageShell title="Hatalar" subtitle="Keşif / HTTP / çıkarım. AI hataları yok.">
      <CrawlerSubnav />
      {error ? <AdminOsErrorState description={error} onRetry={() => window.location.reload()} /> : null}
      {!data && !error ? <TableSkeleton rows={6} cols={5} /> : null}
      {data
        ? SECTIONS.map(({ key, title }) => {
            const rows = (data[key] as Row[] | undefined) ?? []
            const cols = columnsOf(rows)
            return (
              <section key={key} className="space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--color-text))]">
                  {title}
                  <span className="rounded-full bg-[rgb(var(--color-surface))] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[rgb(var(--color-muted))]">{rows.length}</span>
                </h2>
                {rows.length === 0 ? (
                  <AdminOsEmptyState title="Hata yok" description="Bu türde kayıtlı hata bulunmuyor." />
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-[rgb(var(--color-surface))] text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
                        <tr>
                          {cols.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2">{COLUMN_LABEL[c] ?? c}</th>)}
                          <th className="px-3 py-2"><span className="sr-only">Ayrıntı</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgb(var(--color-border))]">
                        {rows.slice(0, 40).map((r, i) => (
                          <tr key={i} className="align-top text-[rgb(var(--color-text))]">
                            {cols.map((c) => (
                              <td key={c} className={c === 'lastFailureReason' || c === 'reason' ? 'max-w-[280px] px-3 py-2' : 'whitespace-nowrap px-3 py-2'}>
                                {c === 'status' ? (
                                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">{cell(r[c])}</span>
                                ) : (
                                  <span className={c === 'lastFailureReason' || c === 'reason' ? 'line-clamp-2' : ''}>{cell(r[c])}</span>
                                )}
                              </td>
                            ))}
                            <td className="px-3 py-2">
                              <details>
                                <summary className="cursor-pointer text-[11px] font-semibold text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">Ayrıntı</summary>
                                <pre className="mt-2 max-w-[420px] overflow-x-auto rounded-lg bg-[rgb(var(--color-surface))] p-2 text-[10px]">{JSON.stringify(r, null, 2)}</pre>
                              </details>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )
          })
        : null}
    </AdminOsPageShell>
  )
}
