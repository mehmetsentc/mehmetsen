'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function ClusterDetailPage() {
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/admin/crawler/clusters/${params.id}`, { headers: await authHeaders() })
      const body = await res.json()
      if (!res.ok) setError(body.error || 'Yüklenemedi')
      else setData(body)
    })()
  }, [params.id])

  const cluster = data?.cluster as Record<string, unknown> | undefined
  const members = (data?.members as Array<Record<string, unknown>>) || []

  return (
    <AdminOsPageShell title="Cluster" subtitle="Event detail — bodies collapsed by default">
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {cluster ? (
        <div className="space-y-3 text-sm">
          <h2 className="text-lg font-semibold">{String(cluster.canonicalTitle || cluster.normalizedTopic)}</h2>
          <p>
            {String(cluster.aiEligibility)} · {String(cluster.aiEligibilityReason || '')} · importance {String(cluster.importanceScore)}
          </p>
          <p className="text-[rgb(var(--color-muted))]">
            {[cluster.countryCode, cluster.region, cluster.city, cluster.district].filter(Boolean).join(' / ')} · first{' '}
            {String(cluster.firstSeenAt)} · last {String(cluster.lastSeenAt)}
          </p>
          <pre className="overflow-x-auto rounded-xl bg-[rgb(var(--color-surface))] p-3 text-xs">
            {JSON.stringify(cluster.importanceBreakdown, null, 2)}
          </pre>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-2 py-1">Source</th>
                <th className="px-2 py-1">Title</th>
                <th className="px-2 py-1">Words</th>
                <th className="px-2 py-1">Conf</th>
                <th className="px-2 py-1">Sim</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={i} className="border-t border-[rgb(var(--color-border))]">
                  <td className="px-2 py-1">{String(m.source)}</td>
                  <td className="px-2 py-1">
                    <button type="button" className="underline" onClick={() => setOpen(open === i ? null : i)}>
                      {String(m.title)}
                    </button>
                    {open === i ? <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">{String(m.preview || '')}</p> : null}
                    <div className="text-xs text-[rgb(var(--color-muted))]">{String(m.url || '')}</div>
                  </td>
                  <td className="px-2 py-1">{String(m.wordCount)}</td>
                  <td className="px-2 py-1">{String(m.extractionConfidence)}</td>
                  <td className="px-2 py-1">{String(m.similarityScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminOsPageShell>
  )
}
