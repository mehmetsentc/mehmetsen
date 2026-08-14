'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'
import type { CityOpsSettings } from '@/types/newsroomOs'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function LocationsAdminPage() {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>('canakkale')
  const [ops, setOps] = useState<CityOpsSettings | null>(null)
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    if (!needle) return TURKISH_PROVINCES
    return TURKISH_PROVINCES.filter(
      (p) =>
        p.name.toLocaleLowerCase('tr-TR').includes(needle) ||
        p.slug.includes(needle)
    )
  }, [q])

  const selectedProvince = TURKISH_PROVINCES.find((p) => p.slug === selected) ?? null
  const districts = selected ? getDistrictsForProvince(selected) : []

  const loadOps = useCallback(async (citySlug: string) => {
    try {
      const res = await fetch(`/api/admin/city-ops?city=${encodeURIComponent(citySlug)}`, {
        headers: await authHeaders(),
      })
      if (!res.ok) throw new Error('ops load failed')
      const body = (await res.json()) as { settings: CityOpsSettings }
      setOps(body.settings)
    } catch {
      setOps(null)
    }
  }, [])

  useEffect(() => {
    if (selected) void loadOps(selected)
  }, [selected, loadOps])

  const saveOps = async () => {
    if (!selected || !ops) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/city-ops', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          citySlug: selected,
          patch: {
            active: ops.active,
            feedEnabled: ops.feedEnabled,
            seoTitle: ops.seoTitle,
            seoDescription: ops.seoDescription,
            pushSegment: ops.pushSegment,
            matrixRules: ops.matrixRules,
          },
        }),
      })
      if (!res.ok) throw new Error('save failed')
      const body = (await res.json()) as { settings: CityOpsSettings }
      setOps(body.settings)
      toast.success('Şehir ayarları kaydedildi')
    } catch {
      toast.error('Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminOsPageShell
      title="81 İl & Lokasyon"
      subtitle="Türkiye → İl → İlçe + şehir ops (SEO / feed / push / SMM matrisi)"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'İl', value: String(TURKISH_PROVINCES.length), tone: 'ok' },
          {
            label: 'Seçili ilçe',
            value: selectedProvince ? String(districts.length) : '—',
          },
          { label: 'Filtre', value: String(filtered.length) },
          { label: 'Ops', value: ops?.active ? 'Aktif' : 'Pasif' },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İl ara…"
            className="mb-3 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm text-[rgb(var(--color-text))] outline-none placeholder:text-[rgb(var(--color-muted))] focus:border-[rgb(var(--color-brand))]/50"
          />
          <div className="max-h-[min(70vh,640px)] space-y-0.5 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setSelected(p.slug)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm',
                  selected === p.slug
                    ? 'bg-[rgb(var(--color-brand))]/10 font-semibold text-[rgb(var(--color-text))]'
                    : 'text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]'
                )}
              >
                <span>{p.name}</span>
                <span className="text-[10px] opacity-60">{p.slug}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
          {!selectedProvince ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">İl seçin</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[rgb(var(--color-text))]">{selectedProvince.name}</h2>
                  <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
                    slug: {selectedProvince.slug} · {districts.length} ilçe
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/smm?city=${selectedProvince.slug}`}
                    className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold"
                  >
                    SMM
                  </Link>
                  <button
                    type="button"
                    onClick={() => void saveOps()}
                    disabled={saving || !ops}
                    className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {saving ? 'Kaydediliyor…' : 'Ops kaydet'}
                  </button>
                </div>
              </div>

              {ops ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ops.active}
                      onChange={(e) => setOps({ ...ops, active: e.target.checked })}
                    />
                    Şehir aktif
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ops.feedEnabled}
                      onChange={(e) => setOps({ ...ops, feedEnabled: e.target.checked })}
                    />
                    Yerel feed açık
                  </label>
                  <div className="sm:col-span-2">
                    <label className="admin-meta">SEO başlık</label>
                    <input
                      value={ops.seoTitle ?? ''}
                      onChange={(e) => setOps({ ...ops, seoTitle: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="admin-meta">SEO açıklama</label>
                    <textarea
                      value={ops.seoDescription ?? ''}
                      onChange={(e) => setOps({ ...ops, seoDescription: e.target.value })}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="admin-meta">Push segment</label>
                    <input
                      value={ops.pushSegment ?? ''}
                      onChange={(e) => setOps({ ...ops, pushSegment: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2 rounded-xl border border-[rgb(var(--color-border))] p-3">
                    <p className="text-xs font-semibold text-[rgb(var(--color-text))]">SMM içerik matrisi</p>
                    <ul className="mt-2 space-y-1 text-xs text-[rgb(var(--color-muted))]">
                      {ops.matrixRules.map((r, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span>
                            {r.match.categoryId || r.match.citySlug || (r.match.isBreaking ? 'breaking' : 'kural')}
                          </span>
                          <span className="font-bold text-[rgb(var(--color-text))]">{r.priority}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[rgb(var(--color-muted))]">Ops yükleniyor…</p>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold">İlçeler</h3>
                <div className="flex flex-wrap gap-1.5">
                  {districts.map((d) => (
                    <span
                      key={d.slug}
                      className="rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1 text-[11px] text-[rgb(var(--color-muted))]"
                    >
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminOsPageShell>
  )
}
