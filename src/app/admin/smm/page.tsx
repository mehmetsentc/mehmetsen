'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AdminOsEmptyState,
  AdminOsErrorState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { auth } from '@/lib/firebase/auth'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

type AgentRow = {
  id: string
  displayName: string
  roleTemplateId: string
  status: string
  territories: string[]
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function SmmNetworkPage() {
  const { can } = useCmsAuth()
  const searchParams = useSearchParams()
  const focusCity = searchParams.get('city')
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState(focusCity ?? '')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/newsroom-agents', { headers })
      const data = (await res.json()) as { agents?: AgentRow[]; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setAgents((data.agents ?? []).filter((a) => a.roleTemplateId === 'city-smm'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byCity = useMemo(() => {
    const map = new Map<string, AgentRow>()
    for (const a of agents) {
      const slug = a.territories?.[0]
      if (slug) map.set(slug, a)
    }
    return map
  }, [agents])

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    return TURKISH_PROVINCES.filter(
      (p) =>
        !needle ||
        p.name.toLocaleLowerCase('tr-TR').includes(needle) ||
        p.slug.includes(needle)
    ).map((p) => {
      const agent = byCity.get(p.slug)
      return {
        ...p,
        agent,
        health: agent ? (agent.status === 'active' ? 'active' : 'warning') : 'missing',
      }
    })
  }, [byCity, q])

  const active = rows.filter((r) => r.health === 'active').length
  const missing = rows.filter((r) => r.health === 'missing').length

  const seed81 = async () => {
    if (!can('agents:manage') && !can('ai:configure')) {
      toast.error('Yetkiniz yok')
      return
    }
    if (!confirm('81 İl SMM ajanı oluşturulacak. Devam?')) return
    setBusy(true)
    try {
      const headers = await authHeaders()
      // Ensure core org first
      await fetch('/api/admin/newsroom-agents', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-core' }),
      })
      const res = await fetch('/api/admin/newsroom-agents', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-smm-81' }),
      })
      const data = (await res.json()) as { created?: string[]; updated?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error || 'Seed başarısız')
      toast.success(`SMM: ${(data.created ?? []).length} yeni, ${(data.updated ?? []).length} güncellendi`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminOsPageShell
      title="81 İl Sosyal Medya Ağı"
      subtitle="City SMM agents · Social Media Director altında"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/social"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
          >
            Hesaplar
          </Link>
          <Link
            href="/admin/smm/queue"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/5"
          >
            Kuyruk
          </Link>
          {(can('agents:manage') || can('ai:configure')) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void seed81()}
              className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '81 İl SMM Oluştur'}
            </button>
          )}
        </div>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'SMM ajan', value: `${active}/81`, tone: active === 81 ? 'ok' : 'warn' },
          { label: 'Eksik', value: String(missing) },
          { label: 'Uyarı', value: String(rows.filter((r) => r.health === 'warning').length) },
          { label: 'Hesap API', value: '—', hint: 'token vault bağlanınca' },
        ]}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İl ara…"
          className="w-full max-w-sm rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 sm:w-72"
        />
        <div className="flex gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Aktif
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Uyarı
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Yok
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <AdminOsErrorState description={error} onRetry={() => void load()} />
      ) : agents.length === 0 ? (
        <AdminOsEmptyState
          title="SMM ağı henüz seed edilmedi"
          description="Social Media Director + 81 city SMM ajanını oluştur. Mevcut /admin/social yayın akışı çalışmaya devam eder."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">İl</th>
                <th className="px-4 py-3">SMM ajan</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr
                  key={r.slug}
                  className={cn('hover:bg-white/[0.03]', focusCity === r.slug && 'bg-white/[0.06]')}
                >
                  <td className="px-4 py-3 font-semibold text-white">{r.name}</td>
                  <td className="px-4 py-3 text-slate-300">{r.agent?.displayName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          r.health === 'active' && 'bg-emerald-500',
                          r.health === 'warning' && 'bg-amber-400',
                          r.health === 'missing' && 'bg-red-500'
                        )}
                      />
                      {r.health === 'active' ? 'Aktif' : r.health === 'warning' ? 'Uyarı' : 'Yok'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/locations`}
                      className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
                    >
                      İl detay
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminOsPageShell>
  )
}
