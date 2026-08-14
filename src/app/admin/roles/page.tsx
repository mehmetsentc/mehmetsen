'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
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
        . Scoped RBAC: `rbacScope.ts` foundation aktif.
      </p>
    </AdminOsPageShell>
  )
}
