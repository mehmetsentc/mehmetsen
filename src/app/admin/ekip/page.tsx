'use client'

/**
 * Phase 2 — "Ekibim" / "İl Ekipleri": il genel editörü (and super admin) manage the
 * province's editors: areas (ilçe × kategori) and rights one by one.
 * All rules are enforced by /api/admin/staff/assignments.
 */
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Pencil, UserPlus } from 'lucide-react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { adminApiFetch, getCachedStaffScope, loadMyStaffScope } from '@/lib/cms/staffScopeClient'
import { STAFF_RIGHT_LABELS, type StaffRight } from '@/lib/cms/staffRights'
import { STAFF_HIERARCHY_ACTIVE_PROVINCES } from '@/lib/cms/staffHierarchy'
import { StaffAccessEditor, describeStaffAccess, type StaffAccessTarget } from '@/components/admin/staff/StaffAccessEditor'
import { FindStaffUserDialog } from '@/components/admin/staff/FindStaffUserDialog'

type StaffRow = StaffAccessTarget & { role: string }

function rightsOf(row: StaffRow): StaffRight[] {
  if (row.tier === 'province_general') return Object.keys(STAFF_RIGHT_LABELS) as StaffRight[]
  const set = new Set<StaffRight>()
  for (const s of row.sections ?? []) s.rights.forEach((r) => set.add(r))
  return [...set]
}

export default function StaffTeamPage() {
  const [province, setProvince] = useState<string>(() => getCachedStaffScope()?.provinceSlug ?? STAFF_HIERARCHY_ACTIVE_PROVINCES[0] ?? 'canakkale')
  const [isSuper, setIsSuper] = useState(false)
  const [fixedProvince, setFixedProvince] = useState<string | null>(null)
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [finding, setFinding] = useState(false)
  const [editing, setEditing] = useState<StaffAccessTarget | null>(null)

  useEffect(() => {
    void loadMyStaffScope().then((s) => {
      setIsSuper(s?.role === 'super_admin')
      if (s?.provinceSlug) {
        setProvince(s.provinceSlug)
        setFixedProvince(s.provinceSlug)
      }
    })
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApiFetch(`/api/admin/staff/assignments?province=${province}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Liste alınamadı')
      setStaff(body.staff as StaffRow[])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Liste alınamadı')
      setStaff([])
    } finally {
      setLoading(false)
    }
  }, [province])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const provinceName = TURKISH_PROVINCES.find((p) => p.slug === province)?.name ?? province

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{isSuper ? 'İl Ekipleri' : 'Ekibim'} — {provinceName}</h1>
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Editörler yalnızca kendilerine verilen ilçe/kategori bölümlerinde, işaretlenen yetkilerle çalışır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuper && !fixedProvince && (
            <select value={province} onChange={(e) => setProvince(e.target.value)} className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm">
              {TURKISH_PROVINCES.filter((p) => STAFF_HIERARCHY_ACTIVE_PROVINCES.includes(p.slug)).map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => setFinding(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <UserPlus className="h-4 w-4" /> Editör ekle
          </button>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        <table className="w-full text-sm">
          <thead className="bg-[rgb(var(--color-surface))] text-left text-xs uppercase tracking-wide text-[rgb(var(--color-muted))]">
            <tr>
              <th className="p-3">Editör</th>
              <th className="p-3">Bölümler</th>
              <th className="p-3">Yetkiler</th>
              <th className="p-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan={4}>Yükleniyor…</td></tr>
            ) : staff.length === 0 ? (
              <tr><td className="p-3" colSpan={4}>Henüz editör yok. “Editör ekle” ile başlayın.</td></tr>
            ) : (
              staff.map((row) => (
                <tr key={row.uid} className="border-t border-[rgb(var(--color-border))] align-top">
                  <td className="p-3">
                    <p className="font-semibold">{row.displayName ?? row.username ?? row.uid}</p>
                    {row.username && <p className="text-xs text-[rgb(var(--color-muted))]">@{row.username}</p>}
                  </td>
                  <td className="p-3 text-[rgb(var(--color-muted))]">{describeStaffAccess(row).replace(/^[^·]*·\s*/, '')}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {rightsOf(row).length === 0 ? (
                        <span className="text-xs text-amber-600">Yetki verilmedi</span>
                      ) : (
                        rightsOf(row).map((r) => (
                          <span key={r} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">{STAFF_RIGHT_LABELS[r]}</span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {(isSuper || row.tier !== 'province_general') && (
                      <button type="button" onClick={() => setEditing(row)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-500/10">
                        <Pencil className="h-4 w-4" /> Düzenle
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {finding && (
        <FindStaffUserDialog
          province={province}
          allowEmail={isSuper}
          onClose={() => setFinding(false)}
          onFound={(u) => {
            setFinding(false)
            setEditing(u)
          }}
        />
      )}
      {editing && (
        <StaffAccessEditor
          target={editing}
          isSuperAdmin={isSuper}
          fixedProvince={fixedProvince}
          onClose={() => setEditing(null)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  )
}
