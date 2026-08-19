'use client'

import { useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function CrawlerFailuresPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/admin/crawler/failures', { headers: await authHeaders() })
      const body = await res.json()
      if (!res.ok) setError(body.error || 'Yüklenemedi')
      else setData(body)
    })()
  }, [])

  return (
    <AdminOsPageShell title="Hatalar" subtitle="Keşif / HTTP / çıkarım. AI hataları yok.">
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {(['discoveryFailures', 'httpFailures', 'extractionFailures'] as const).map((key) => {
        const rows = (data?.[key] as Array<Record<string, unknown>>) || []
        return (
          <section key={key} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold">
              {key === 'discoveryFailures' ? 'Keşif hataları' : key === 'httpFailures' ? 'HTTP hataları' : 'Çıkarım hataları'}
            </h2>
            <pre className="overflow-x-auto rounded-xl bg-[rgb(var(--color-surface))] p-3 text-xs">
              {JSON.stringify(rows.slice(0, 40), null, 2)}
            </pre>
          </section>
        )
      })}
    </AdminOsPageShell>
  )
}
