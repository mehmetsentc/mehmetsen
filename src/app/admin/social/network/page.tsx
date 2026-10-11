'use client'

/**
 * İl Ağı — 81 il, yalnızca gerçek veriden: bağlı il hesapları, yayın izni hazır
 * olanlar ve açık otomasyon kuralları. Tahmini / örnek veri gösterilmez.
 */
import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { cn } from '@/lib/utils'
import { AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { TurkeySmmMap } from '@/components/admin/os/TurkeySmmMap'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { useSocialNetwork } from '@/components/admin/social/useSocialNetwork'
import { PLATFORM_LABEL } from '@/components/social/socialClient'
import { TARGET_BLOCKER_TEXT } from '@/lib/social/accounts/capabilities'

function NetworkInner() {
  const { byProvince, loading, error } = useSocialNetwork()
  const focus = useSearchParams().get('city')
  const [q, setQ] = useState('')

  const activeSlugs = useMemo(() => new Set([...byProvince].filter(([, v]) => v.enabledRules > 0).map(([k]) => k)), [byProvince])
  const warnSlugs = useMemo(() => new Set([...byProvince].filter(([, v]) => v.enabledRules === 0).map(([k]) => k)), [byProvince])
  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    return TURKISH_PROVINCES.filter((p) => !needle || p.name.toLocaleLowerCase('tr-TR').includes(needle) || p.slug.includes(needle))
      .map((p) => ({ ...p, data: byProvince.get(p.slug) ?? null }))
      .sort((a, b) => (b.data?.accounts.length ?? 0) - (a.data?.accounts.length ?? 0) || a.name.localeCompare(b.name, 'tr'))
  }, [byProvince, q])
  const focused = focus ? TURKISH_PROVINCES.find((p) => p.slug === focus) : null
  const focusedData = focus ? byProvince.get(focus) : null

  if (loading) return <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Yükleniyor…</p>
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800">{error}</p>

  const connected = byProvince.size
  const ready = [...byProvince.values()].filter((v) => v.ready > 0).length
  return (
    <>
      <AdminOsMetricGrid
        items={[
          { label: 'Hesabı bağlı il', value: `${connected}/81`, tone: connected ? 'ok' : 'warn' },
          { label: 'Yayın izni hazır il', value: String(ready) },
          { label: 'Otomasyonu açık il', value: String(activeSlugs.size) },
          { label: 'Bağlı il hesabı', value: String([...byProvince.values()].reduce((n, v) => n + v.accounts.length, 0)) },
        ]}
      />
      {focused && (
        <section className="rounded-xl border border-blue-300 bg-[rgb(var(--color-card))] p-3 dark:border-blue-800">
          <h2 className="mb-2 text-sm font-bold">{focused.name}</h2>
          {!focusedData ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Bu il için bağlı hesap yok.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {focusedData.accounts.map((a) => (
                <li key={a.id}>
                  <b>{a.displayName}</b> · {PLATFORM_LABEL[a.platform]} · bağlantı {a.status === 'active' ? 'etkin' : a.status} · yayın izni {a.health.publishBlocker ? TARGET_BLOCKER_TEXT[a.health.publishBlocker] : 'hazır'}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İl ara" className="mb-2 w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1.5 text-sm sm:w-64" aria-label="İl ara" />
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[rgb(var(--color-card))] text-xs text-[rgb(var(--color-muted))]">
              <tr>
                <th className="py-1.5 pr-2">İl</th>
                <th className="py-1.5 pr-2">Bağlı hesap</th>
                <th className="py-1.5 pr-2">Yayın izni hazır</th>
                <th className="py-1.5">Açık kural</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--color-border))]">
              {rows.map((r) => (
                <tr key={r.slug} className={cn(!r.data && 'text-[rgb(var(--color-muted))]')}>
                  <td className="py-1.5 pr-2">
                    <a href={`/admin/social/network?city=${encodeURIComponent(r.slug)}`} className="hover:underline">{r.name}</a>
                  </td>
                  <td className="py-1.5 pr-2">{r.data ? r.data.accounts.map((a) => PLATFORM_LABEL[a.platform]).join(', ') : '—'}</td>
                  <td className="py-1.5 pr-2">{r.data ? `${r.data.ready}/${r.data.accounts.length}` : '—'}</td>
                  <td className="py-1.5">{r.data ? r.data.enabledRules : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <TurkeySmmMap
        activeSlugs={activeSlugs}
        warnSlugs={warnSlugs}
        hrefFor={(slug) => `/admin/social/network?city=${encodeURIComponent(slug)}`}
        legend={{ active: 'Otomasyon açık', warn: 'Hesap bağlı, otomasyon kapalı', unknown: 'Bağlı hesap yok' }}
        className="min-h-[240px]"
      />
    </>
  )
}

export default function SocialNetworkPage() {
  return (
    <AdminOsPageShell title="İl Ağı" subtitle="81 il — yalnızca gerçek bağlantı, izin ve kural verisi">
      <SocialAdminNav />
      <Suspense fallback={null}>
        <NetworkInner />
      </Suspense>
    </AdminOsPageShell>
  )
}
