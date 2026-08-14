'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import type { PageLayout } from '@/types/newsroomOs'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function GlobalLayoutPage() {
  const [layouts, setLayouts] = useState<PageLayout[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/page-layouts', { headers: await authHeaders() })
        if (!res.ok) return
        const body = (await res.json()) as { layouts: PageLayout[] }
        setLayouts(body.layouts)
      } catch {
        /* ignore */
      }
    })()
  }, [])

  return (
    <AdminOsPageShell
      title="Global Dizilim"
      subtitle="Navbar / kategoriler / ana sayfa blokları / footer — versiyonlu (Taslak → Önizleme → Yayın)"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Sayfa layout', value: String(layouts.length || '—') },
          { label: 'Yayında', value: String(layouts.filter((l) => l.status === 'published').length) },
          { label: 'Taslak', value: String(layouts.filter((l) => l.status === 'draft').length) },
          { label: 'Rollback', value: 'Sürümler API' },
        ]}
      />
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--color-border))] text-[11px] uppercase text-[rgb(var(--color-muted))]">
              <th className="px-4 py-3">Sayfa</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">Sürüm</th>
              <th className="px-4 py-3">Blok</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--color-border))]">
            {layouts.map((l) => (
              <tr key={l.pageKey}>
                <td className="px-4 py-3 font-semibold">{l.label}</td>
                <td className="px-4 py-3 admin-meta">{l.status}</td>
                <td className="px-4 py-3 tabular-nums">{l.version}</td>
                <td className="px-4 py-3 tabular-nums">{l.blocks?.length ?? 0}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href="/admin/page-controls"
                    className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
                  >
                    Düzenle →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminOsPageShell>
  )
}
