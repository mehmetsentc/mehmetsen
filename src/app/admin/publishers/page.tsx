'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Play, RefreshCw } from 'lucide-react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { ROUTES } from '@/constants/routes'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { PublisherAdminFilter, PublisherRecord } from '@/types/publisher'
import toast from 'react-hot-toast'

const FILTERS: Array<{ id: PublisherAdminFilter; label: string }> = [
  { id: 'all', label: 'Tümü' },
  { id: 'unclaimed', label: 'Sahipsiz' },
  { id: 'pending', label: 'Bekleyen' },
  { id: 'verified', label: 'Doğrulanmış' },
  { id: 'rejected', label: 'Reddedilen' },
]

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function statusLabel(p: PublisherRecord): string {
  if (p.verificationStatus === 'VERIFIED') return 'Doğrulandı'
  if (p.verificationStatus === 'PENDING') return 'Talep bekliyor'
  if (p.verificationStatus === 'REJECTED') return 'Reddedildi'
  if (p.status === 'SUSPENDED') return 'Askıda'
  if (p.status === 'INACTIVE') return 'Pasif'
  return 'Sahipsiz'
}

export default function AdminPublishersPage() {
  const [filter, setFilter] = useState<PublisherAdminFilter>('all')
  const [items, setItems] = useState<PublisherRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/publishers?filter=${encodeURIComponent(filter)}&pageSize=100`,
        { headers: await authHeaders() }
      )
      const body = (await res.json()) as {
        items?: PublisherRecord[]
        total?: number
        error?: string
      }
      if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
      setItems(body.items ?? [])
      setTotal(body.total ?? 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Liste yüklenemedi')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const runBootstrap = async (dryRun: boolean) => {
    setBootstrapping(true)
    try {
      const res = await fetch('/api/admin/publishers/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ dryRun, limit: 25 }),
      })
      const body = (await res.json()) as {
        error?: string
        created?: number
        matched?: number
        skipped?: number
        dryRun?: boolean
      }
      if (!res.ok) throw new Error(body.error || 'Bootstrap başarısız')
      toast.success(
        dryRun
          ? `Dry-run: ${body.created ?? 0} oluşturulur, ${body.matched ?? 0} eşleşir, ${body.skipped ?? 0} atlanır`
          : `Bootstrap: ${body.created ?? 0} oluşturuldu, ${body.matched ?? 0} eşleşti`
      )
      if (!dryRun) void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bootstrap başarısız')
    } finally {
      setBootstrapping(false)
    }
  }

  return (
    <AdminOsPageShell
      title="Publisherlar"
      subtitle="Yayın kuruluşları, kaynak bağlantıları ve sahiplik talepleri (Phase P1)"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Toplam', value: String(total), tone: 'ok' },
          { label: 'Filtre', value: FILTERS.find((f) => f.id === filter)?.label ?? filter },
          { label: 'Liste', value: loading ? '…' : String(items.length) },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
              filter === f.id
                ? 'bg-[rgb(var(--color-brand))] text-white'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
            )}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={bootstrapping}
            onClick={() => void runBootstrap(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Dry-run (25)
          </button>
          <button
            type="button"
            disabled={bootstrapping}
            onClick={() => void runBootstrap(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', bootstrapping && 'animate-spin')} />
            Bootstrap (25)
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
            <tr>
              <th className="px-4 py-3 font-bold">Yayın</th>
              <th className="px-4 py-3 font-bold">Durum</th>
              <th className="px-4 py-3 font-bold">Domain</th>
              <th className="px-4 py-3 font-bold">Şehir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--color-border))]">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[rgb(var(--color-muted))]">
                  Yükleniyor…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[rgb(var(--color-muted))]">
                  Kayıt yok. Bootstrap dry-run ile news_sources eşlemesini test edin.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="hover:bg-[rgb(var(--color-surface))]/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`${ROUTES.ADMIN.PUBLISHERS}/${p.id}`}
                      className="inline-flex items-center gap-2 font-semibold text-[rgb(var(--color-brand))] hover:underline"
                    >
                      <Building2 className="h-4 w-4 shrink-0 opacity-60" />
                      {p.displayName}
                    </Link>
                    <div className="text-xs text-[rgb(var(--color-muted))]">/{p.slug}</div>
                  </td>
                  <td className="px-4 py-3">{statusLabel(p)}</td>
                  <td className="px-4 py-3 text-[rgb(var(--color-muted))]">
                    {p.primaryDomain ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[rgb(var(--color-muted))]">{p.city ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminOsPageShell>
  )
}
