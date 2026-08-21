'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { CrawlerPager } from '@/components/admin/crawler/CrawlerPager'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import { CRAWLER_STATUS_LABELS } from '@/services/crawler/editorial/labels'
import { loadAdminJson } from '@/lib/adminApiError'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface SourceRow {
  id: string
  name: string
  domain: string
  countryCode: string
  city: string | null
  language: string
  discoveryMethod: string
  crawlIntervalSeconds: number
  lastDiscoveryAt: string | Date | null
  lastSuccessfulDiscoveryAt: string | Date | null
  extractionSuccessRate: number | null
  status: string
}

function fmtDate(value: string | Date | null): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR')
}

function fmtPct(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value * 100)}%`
}

export default function CrawlerSourcesPage() {
  const [sources, setSources] = useState<SourceRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [country, setCountry] = useState('')
  const [scope, setScope] = useState('')
  const [tier, setTier] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    domain: '',
    baseUrl: '',
    countryCode: '',
    language: '',
    rssUrls: '',
    sitemapUrls: '',
    discoveryType: 'RSS',
    crawlIntervalSeconds: '300',
    fetchMode: 'HTTP',
  })

  const load = useCallback(async () => {
    setError(null)
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (search) q.set('search', search)
    if (status) q.set('status', status)
    if (country) q.set('country', country)
    if (scope) q.set('scope', scope)
    if (tier) q.set('tier', tier)
    const result = await loadAdminJson<{ sources?: SourceRow[] | null; total?: number | null; totalPages?: number }>(
      `/api/admin/crawler/sources?${q}`,
      { headers: await authHeaders() }
    )
    if (!result.ok) {
      setError(result.error)
      setSources([])
      setTotal(-1)
      return
    }
    setSources(result.data.sources || [])
    setTotal(Number(result.data.total ?? (result.data.sources || []).length))
    setTotalPages(Number(result.data.totalPages || 1))
  }, [page, pageSize, search, status, country, scope, tier])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(id: string, status: string) {
    setBusyId(id)
    try {
      const next = status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
      const body: { id: string; status: string; pauseReason?: string } = { id, status: next }
      if (next === 'PAUSED') {
        body.pauseReason = 'manual_cms_pause'
      }
      const res = await fetch('/api/admin/crawler/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const bodyErr = (await res.json()) as { error?: string }
        throw new Error(bodyErr.error || 'Güncellenemedi')
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncellenemedi')
    } finally {
      setBusyId(null)
    }
  }

  async function createSource(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const payload = {
        name: form.name,
        domain: form.domain,
        baseUrl: form.baseUrl,
        countryCode: form.countryCode,
        language: form.language,
        discoveryMethod: form.discoveryType,
        crawlIntervalSeconds: Number(form.crawlIntervalSeconds) || 300,
        articleFetchMode: form.fetchMode,
        rssUrls: form.rssUrls.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        sitemapUrls: form.sitemapUrls.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      }
      const res = await fetch('/api/admin/crawler/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Eklenemedi')
      setForm({
        name: '',
        domain: '',
        baseUrl: '',
        countryCode: '',
        language: '',
        rssUrls: '',
        sitemapUrls: '',
        discoveryType: 'RSS',
        crawlIntervalSeconds: '300',
        fetchMode: 'HTTP',
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi')
    }
  }

  async function testSource() {
    setError(null)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/crawler/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          name: form.name || 'Test',
          domain: form.domain,
          baseUrl: form.baseUrl,
          countryCode: form.countryCode || 'XX',
          language: form.language || 'en',
          discoveryMethod: form.discoveryType,
          crawlIntervalSeconds: Number(form.crawlIntervalSeconds) || 300,
          articleFetchMode: form.fetchMode,
          rssUrls: form.rssUrls.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
          sitemapUrls: form.sitemapUrls.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Test başarısız')
      setTestResult(JSON.stringify({ aiCalls: 0, ...body }, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test başarısız')
    }
  }

  return (
    <AdminOsPageShell title="Crawler Kaynakları" subtitle="Arama / filtre / sayfalama. Duraklatıldı ≠ bozuk. Yeni kaynak güvenli varsayılanlarla başlar.">
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <form
        className="mb-3 flex flex-wrap gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          void load()
        }}
      >
        <input className="rounded border px-2 py-1" placeholder="Ara" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="rounded border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Durum</option>
          <option value="ACTIVE">Aktif</option>
          <option value="PAUSED">Duraklatıldı</option>
          <option value="DEGRADED">Zayıf</option>
          <option value="DISABLED">Kapalı</option>
        </select>
        <input className="rounded border px-2 py-1" placeholder="Ülke" value={country} onChange={(e) => setCountry(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Kapsam" value={scope} onChange={(e) => setScope(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Tier" value={tier} onChange={(e) => setTier(e.target.value)} />
        <button type="submit" className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1 text-white">
          Filtrele
        </button>
      </form>

      <form onSubmit={createSource} className="grid gap-3 rounded-2xl border border-[rgb(var(--color-border))] p-4 md:grid-cols-3">
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="domain.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="https://..." value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Ülke (TR)" maxLength={2} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Dil (tr)" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} required />
        <input className="rounded-lg border px-3 py-2 text-sm md:col-span-2" placeholder="RSS / Atom URL" value={form.rssUrls} onChange={(e) => setForm({ ...form, rssUrls: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm md:col-span-2" placeholder="Sitemap URL" value={form.sitemapUrls} onChange={(e) => setForm({ ...form, sitemapUrls: e.target.value })} />
        <select className="rounded-lg border px-3 py-2 text-sm" value={form.discoveryType} onChange={(e) => setForm({ ...form, discoveryType: e.target.value })}>
          <option value="RSS">RSS</option>
          <option value="ATOM">ATOM</option>
          <option value="NEWS_SITEMAP">NEWS_SITEMAP</option>
          <option value="SITEMAP">SITEMAP</option>
          <option value="LISTING">LISTING</option>
          <option value="HYBRID">HYBRID</option>
        </select>
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Interval (sn)" value={form.crawlIntervalSeconds} onChange={(e) => setForm({ ...form, crawlIntervalSeconds: e.target.value })} />
        <select className="rounded-lg border px-3 py-2 text-sm" value={form.fetchMode} onChange={(e) => setForm({ ...form, fetchMode: e.target.value })}>
          <option value="HTTP">HTTP</option>
          <option value="AUTO">AUTO</option>
          <option value="BROWSER">BROWSER</option>
        </select>
        <button type="submit" className="rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white">
          Kaynak ekle
        </button>
        <button type="button" onClick={() => void testSource()} className="rounded-lg border px-4 py-2 text-sm font-semibold">
          Test Source
        </button>
      </form>

      {testResult ? (
        <pre className="max-h-64 overflow-auto rounded-xl bg-[rgb(var(--color-surface))] p-3 text-xs">{testResult}</pre>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
            <tr>
              <th className="px-3 py-2">Kaynak</th>
              <th className="px-3 py-2">Ülke / şehir</th>
              <th className="px-3 py-2">Dil</th>
              <th className="px-3 py-2">Keşif</th>
              <th className="px-3 py-2">Interval</th>
              <th className="px-3 py-2">Son kontrol</th>
              <th className="px-3 py-2">Son başarı</th>
              <th className="px-3 py-2">Başarı</th>
              <th className="px-3 py-2">Durum</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-3 py-2">
                  <div className="font-medium">{source.name}</div>
                  <div className="text-[rgb(var(--color-muted))]">{source.domain}</div>
                </td>
                <td className="px-3 py-2">
                  {source.countryCode}
                  {source.city ? ` / ${source.city}` : ''}
                </td>
                <td className="px-3 py-2">{source.language}</td>
                <td className="px-3 py-2">{source.discoveryMethod}</td>
                <td className="px-3 py-2">{source.crawlIntervalSeconds}s</td>
                <td className="px-3 py-2">{fmtDate(source.lastDiscoveryAt)}</td>
                <td className="px-3 py-2">{fmtDate(source.lastSuccessfulDiscoveryAt)}</td>
                <td className="px-3 py-2">{fmtPct(source.extractionSuccessRate)}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={busyId === source.id}
                    onClick={() => void toggle(source.id, source.status)}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs font-semibold',
                      source.status === 'ACTIVE' ? 'bg-emerald-600 text-white' : 'bg-slate-500 text-white'
                    )}
                  >
                    {CRAWLER_STATUS_LABELS[source.status] || source.status}
                  </button>
                </td>
              </tr>
            ))}
            {!sources.length ? (
              <tr>
                <td className="px-3 py-6 text-[rgb(var(--color-muted))]" colSpan={9}>
                  Kayıtlı kaynak yok. Phase 0 otomatik crawl başlatmaz.
                </td>
              </tr>
            ) : null}
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
