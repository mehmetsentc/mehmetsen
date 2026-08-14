'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import { cn } from '@/lib/utils'

export default function LocationsAdminPage() {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>('canakkale')

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

  return (
    <AdminOsPageShell
      title="81 İl & Lokasyon"
      subtitle="Türkiye → İl → İlçe — mevcut province constants üzerinden"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'İl', value: String(TURKISH_PROVINCES.length), tone: 'ok' },
          {
            label: 'Seçili ilçe',
            value: selectedProvince ? String(districts.length) : '—',
          },
          { label: 'Filtre', value: String(filtered.length) },
          { label: 'Ülke', value: 'TR' },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-white/10 bg-[rgb(var(--admin-card))] p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="İl ara…"
            className="mb-3 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[rgb(var(--color-brand))]/50"
          />
          <div className="max-h-[min(70vh,640px)] space-y-0.5 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => setSelected(p.slug)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm',
                  selected === p.slug ? 'bg-white/12 text-white' : 'text-slate-300 hover:bg-white/[0.06]'
                )}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-[10px] text-slate-500">{p.slug}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[rgb(var(--admin-card))] p-5">
          {!selectedProvince ? (
            <p className="text-sm text-slate-500">İl seçin</p>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedProvince.name}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  slug: {selectedProvince.slug} · lat {selectedProvince.lat} · lng {selectedProvince.lng}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Yerel editör', href: '/admin/ai-editors' },
                  { label: 'SMM ajan', href: `/admin/smm?city=${selectedProvince.slug}` },
                  { label: 'Şehir haberleri', href: `/admin/news?city=${selectedProvince.slug}` },
                  { label: 'Sosyal hesaplar', href: '/admin/social' },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm font-semibold text-white hover:border-[rgb(var(--color-brand))]/40"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-white">
                  İlçeler ({districts.length})
                </h3>
                {districts.length === 0 ? (
                  <p className="text-sm text-slate-500">İlçe listesi bulunamadı.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {districts.map((d) => (
                      <span
                        key={d.slug}
                        className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-slate-300"
                      >
                        {d.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Şehir ops ayarları (SEO, feed weight, push segment, reklam) Firestore `cityOpsSettings`
                koleksiyonuna Phase 4 devamında yazılacak — mevcut haber/city site akışı bozulmaz.
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminOsPageShell>
  )
}
