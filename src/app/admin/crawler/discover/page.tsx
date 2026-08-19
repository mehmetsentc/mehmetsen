'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function CrawlerDiscoverPage() {
  const [domain, setDomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [registryCount, setRegistryCount] = useState(0)

  const run = useCallback(async (target?: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/crawler/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ domain: target || domain, test: true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Keşif başarısız')
      setResult(body as Record<string, unknown>)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Keşif başarısız')
    } finally {
      setBusy(false)
    }
  }, [domain])

  const approve = useCallback(async () => {
    const test = result?.test as { proposed?: Record<string, unknown>; outcome?: string } | undefined
    const discovered = result?.discovered as { domain?: string; baseUrl?: string; rssUrls?: string[]; sitemapUrls?: string[]; suggestedDiscoveryMethod?: string; language?: string; countryCode?: string } | undefined
    if (!discovered?.domain || !test?.proposed) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/crawler/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          approve: true,
          name: discovered.domain,
          domain: discovered.domain,
          baseUrl: discovered.baseUrl,
          countryCode: discovered.countryCode || 'TR',
          language: discovered.language || 'tr',
          discoveryMethod: test.proposed.discoveryType,
          rssUrls: test.proposed.rssUrls,
          sitemapUrls: test.proposed.sitemapUrls,
          articleFetchMode: test.proposed.fetchMode,
          requiresJavascript: test.proposed.requiresJavascript,
          crawlIntervalSeconds: test.proposed.crawlInterval,
          qualityTier: test.proposed.qualityTier,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Kayıt başarısız')
      setError(null)
      setResult({ ...result, approved: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setBusy(false)
    }
  }, [result])

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/admin/crawler/discover', { headers: await authHeaders() })
      const body = await res.json().catch(() => ({}))
      setRegistryCount(Number((body as { registryCount?: number }).registryCount) || 0)
    })()
  }, [])

  return (
    <AdminOsPageShell
      title="Kaynak Keşfi"
      subtitle="AI yok. Domain gir, RSS/sitemap keşfet, test et, onayla. Test kalıcı kaynak yazmaz."
    >
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <input
          className="min-w-[240px] flex-1 rounded-lg border px-3 py-2 text-sm"
          placeholder="ornek.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white">
          Keşfet ve test et
        </button>
        <button type="button" disabled={busy || !result} onClick={() => void approve()} className="rounded-lg border px-4 py-2 text-sm font-semibold">
          Kaynağı onayla
        </button>
      </form>
      <p className="text-xs text-[rgb(var(--color-muted))]">
        Türkiye registry: {registryCount} kaynak (hepsi otomatik ACTIVE olmaz).
      </p>
      {result ? (
        <pre className="max-h-[420px] overflow-auto rounded-xl bg-[rgb(var(--color-surface))] p-3 text-xs">
          {JSON.stringify(
            {
              outcome: (result.test as { outcome?: string } | undefined)?.outcome,
              tier: (result.test as { tier?: string } | undefined)?.tier,
              persisted: (result.test as { persisted?: boolean } | undefined)?.persisted,
              aiCalls: 0,
              discovered: result.discovered,
              proposed: (result.test as { proposed?: unknown } | undefined)?.proposed,
              samples: (result.test as { samples?: unknown } | undefined)?.samples,
              approved: result.approved || false,
            },
            null,
            2
          )}
        </pre>
      ) : null}
    </AdminOsPageShell>
  )
}
