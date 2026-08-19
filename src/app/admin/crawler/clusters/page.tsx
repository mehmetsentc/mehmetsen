'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface ClusterRow {
  id: string
  canonicalTitle: string | null
  status: string
  countryCode: string | null
  city: string | null
  firstSeenAt: string
  lastSeenAt: string
  articleCount: number
  uniqueSourceCount: number
  clusterConfidence: number
  importanceScore: number
  aiEligibility: string
}

export default function CrawlerClustersPage() {
  const [rows, setRows] = useState<ClusterRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hours, setHours] = useState('24')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [minSources, setMinSources] = useState('')

  const load = useCallback(async () => {
    setError(null)
    const q = new URLSearchParams({ hours })
    if (country) q.set('country', country)
    if (city) q.set('city', city)
    if (eligibility) q.set('eligibility', eligibility)
    if (minSources) q.set('minSources', minSources)
    const res = await fetch(`/api/admin/crawler/clusters?${q}`, { headers: await authHeaders() })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    setRows((body.clusters || []) as ClusterRow[])
  }, [hours, country, city, eligibility, minSources])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  return (
    <AdminOsPageShell title="Olay Kümeleri" subtitle="Belirleyici kümeler. AI yok.">
      <CrawlerSubnav />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <select value={hours} onChange={(e) => setHours(e.target.value)} className="rounded border px-2 py-1">
          <option value="6">6s</option>
          <option value="24">24s</option>
          <option value="72">72s</option>
        </select>
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="ülke" className="rounded border px-2 py-1 w-20" />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="şehir" className="rounded border px-2 py-1 w-28" />
        <select value={eligibility} onChange={(e) => setEligibility(e.target.value)} className="rounded border px-2 py-1">
          <option value="">eligibility</option>
          <option value="WATCHING">WATCHING</option>
          <option value="ELIGIBLE">ELIGIBLE</option>
          <option value="HIGH_PRIORITY">HIGH_PRIORITY</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <input value={minSources} onChange={(e) => setMinSources(e.target.value)} placeholder="min sources" className="rounded border px-2 py-1 w-28" />
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase text-[rgb(var(--color-muted))]">
            <tr>
              <th className="px-3 py-2">Başlık</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Coğrafya</th>
              <th className="px-3 py-2">Haber</th>
              <th className="px-3 py-2">Kaynak</th>
              <th className="px-3 py-2">Önem</th>
              <th className="px-3 py-2">Güven</th>
              <th className="px-3 py-2">AI kapısı</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-3 py-2">
                  <Link href={`/admin/crawler/clusters/${c.id}`} className="underline">
                    {c.canonicalTitle || c.id}
                  </Link>
                </td>
                <td className="px-3 py-2">{c.status}</td>
                <td className="px-3 py-2">{[c.countryCode, c.city].filter(Boolean).join(' / ') || '—'}</td>
                <td className="px-3 py-2">{c.articleCount}</td>
                <td className="px-3 py-2">{c.uniqueSourceCount}</td>
                <td className="px-3 py-2">{c.importanceScore}</td>
                <td className="px-3 py-2">{c.clusterConfidence?.toFixed?.(2) ?? c.clusterConfidence}</td>
                <td className="px-3 py-2">{c.aiEligibility}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminOsPageShell>
  )
}
