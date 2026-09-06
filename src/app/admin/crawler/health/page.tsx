'use client'

import { useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { CrawlerPager } from '@/components/admin/crawler/CrawlerPager'
import { auth } from '@/lib/firebase/auth'
import { CRAWLER_STATUS_LABELS } from '@/services/crawler/editorial/labels'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface YieldSummary {
  discoveredUrls: number
  rawArticles: number
  duplicateRate: number | null
  uniqueRate: number | null
}

interface Row {
  name: string
  status: string
  healthScore: number
  lastSuccessfulDiscoveryAt: string | null
  lastSuccessfulExtractionAt: string | null
  consecutiveFailures: number
  extractionSuccessRate: number | null
  averageConfidence: number
  yield7d?: YieldSummary
  yield30d?: YieldSummary
}

function formatYield(y?: YieldSummary): string {
  if (!y) return '—'
  const unique = y.uniqueRate == null ? '—' : `%${Math.round(y.uniqueRate * 100)}`
  const dup = y.duplicateRate == null ? '—' : `%${Math.round(y.duplicateRate * 100)}`
  return `${y.discoveredUrls} keşif · ${unique} tekil · ${dup} dup`
}

export default function CrawlerHealthPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [http429, setHttp429] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/admin/crawler/health?page=${page}&pageSize=${pageSize}`, { headers: await authHeaders() })
      const body = await res.json()
      if (!res.ok) setError(body.error || 'Yüklenemedi')
      else {
        setRows((body.sources || []) as Row[])
        setHttp429(Number(body.http429 || 0))
        setTotal(Number(body.total || (body.sources || []).length))
        setTotalPages(Number(body.totalPages || 1))
      }
    })()
  }, [page, pageSize])

  return (
    <AdminOsPageShell title="Crawler Sağlığı" subtitle="Kaynak sağlığı, 429, çıkarım oranları, unique yield">
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <p className="mb-3 text-sm">Bugünkü HTTP 429: {http429}</p>
      <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1">Kaynak</th>
            <th className="px-2 py-1">Durum</th>
            <th className="px-2 py-1">Sağlık</th>
            <th className="px-2 py-1">Son keşif</th>
            <th className="px-2 py-1">Son çıkarım</th>
            <th className="px-2 py-1">Hata</th>
            <th className="px-2 py-1">Çıkarım oranı</th>
            <th className="px-2 py-1">Ort. güven</th>
            <th className="px-2 py-1" title="Son 7 günde keşfedilen URL sayısı · bunların kaç yüzdesi ilk/orijinal (PRIMARY) haber oldu · duplicate oranı">7g Yield</th>
            <th className="px-2 py-1" title="Son 30 günde keşfedilen URL sayısı · bunların kaç yüzdesi ilk/orijinal (PRIMARY) haber oldu · duplicate oranı">30g Yield</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-[rgb(var(--color-border))]">
              <td className="px-2 py-1">{r.name}</td>
              <td className="px-2 py-1">{CRAWLER_STATUS_LABELS[r.status] || r.status}</td>
              <td className="px-2 py-1">{r.healthScore}</td>
              <td className="px-2 py-1">{r.lastSuccessfulDiscoveryAt ? new Date(r.lastSuccessfulDiscoveryAt).toLocaleString('tr-TR') : '—'}</td>
              <td className="px-2 py-1">{r.lastSuccessfulExtractionAt ? new Date(r.lastSuccessfulExtractionAt).toLocaleString('tr-TR') : '—'}</td>
              <td className="px-2 py-1">{r.consecutiveFailures}</td>
              <td className="px-2 py-1">{r.extractionSuccessRate == null ? '—' : `${Math.round(r.extractionSuccessRate * 100)}%`}</td>
              <td className="px-2 py-1">{r.averageConfidence}</td>
              <td className="px-2 py-1 whitespace-nowrap">{formatYield(r.yield7d)}</td>
              <td className="px-2 py-1 whitespace-nowrap">{formatYield(r.yield30d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <CrawlerPager
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n)
          setPage(1)
        }}
      />
    </AdminOsPageShell>
  )
}
