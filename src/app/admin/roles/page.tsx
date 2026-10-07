'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { STAFF_RIGHTS, STAFF_RIGHT_LABELS } from '@/lib/cms/staffRights'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'

type RoleRow = {
  role: string
  label: string
  permissions: string[]
  count: number
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/os-ops?resource=roles', { headers: await authHeaders() })
      const body = (await res.json()) as { roles?: RoleRow[] }
      if (res.ok) {
        setRoles(body.roles ?? [])
        setSelected(body.roles?.[0]?.role ?? null)
      }
    } catch {
      setRoles([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const active = roles.find((r) => r.role === selected) ?? null

  return (
    <AdminOsPageShell
      title="Roller & İzinler"
      subtitle="Canlı CmsRole matrisi — scope grant UI users ekranı ile birlikte çalışır"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Rol', value: String(roles.length) },
          { label: 'Seçili perm', value: String(active?.count ?? 0), tone: 'ok' },
          { label: 'Scope', value: 'city/category hazır' },
          { label: 'Atama', value: 'Users' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-2">
          {roles.map((r) => (
            <button
              key={r.role}
              type="button"
              onClick={() => setSelected(r.role)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${
                selected === r.role
                  ? 'bg-[rgb(var(--color-brand))]/10 font-semibold'
                  : 'hover:bg-[rgb(var(--color-surface))]'
              }`}
            >
              <span>{r.label}</span>
              <span className="text-[10px] tabular-nums text-[rgb(var(--color-muted))]">{r.count}</span>
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          {!active ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Rol seçin</p>
          ) : (
            <>
              <h2 className="text-lg font-bold">{active.label}</h2>
              <p className="mb-3 text-xs text-[rgb(var(--color-muted))]">{active.role}</p>
              <div className="flex flex-wrap gap-1.5">
                {active.permissions.map((p) => (
                  <span
                    key={p}
                    className="rounded-full border border-[rgb(var(--color-border))] px-2.5 py-1 text-[11px] font-medium"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-[rgb(var(--color-muted))]">
        Kullanıcıya rol atamak için{' '}
        <Link href="/admin/users" className="font-semibold text-[rgb(var(--color-brand))]">
          Adminler / Kullanıcılar
        </Link>
. İl / ilçe / kategori editörleri için{' '}
        <Link href="/admin/ekip" className="font-semibold text-[rgb(var(--color-brand))]">
          İl Ekipleri
        </Link>
        .
      </p>
      <section className="mt-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <h2 className="font-semibold">Bölüm editörü yetkileri</h2>
        <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
          İl genel editörü ilin tamamından sorumludur. Bölüm editörleri bir ildeki bir veya birden fazla ilçe/kategori
          bölümünden sorumludur; her bölümde aşağıdaki yetkiler tek tek açılır (yeni editörde hepsi kapalı gelir).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STAFF_RIGHTS.map((r) => (
            <span key={r} className="rounded-full border border-[rgb(var(--color-border))] px-3 py-1 text-xs font-medium">
              {STAFF_RIGHT_LABELS[r]}
            </span>
          ))}
        </div>
        <Link href="/admin/ekip" className="mt-3 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Editör ekle / düzenle
        </Link>
      </section>
    </AdminOsPageShell>
  )
}
