'use client'

/**
 * Phase 2 — "Ekibim": il genel editörü (and super admin) manage the province's
 * ilçe / kategori editors. All rules are enforced by /api/admin/staff/assignments.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { getDistrictsForProvince, TURKISH_PROVINCES } from '@/constants/cities'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { adminApiFetch, getCachedStaffScope, loadMyStaffScope } from '@/lib/cms/staffScopeClient'

interface StaffRow {
  uid: string
  username: string | null
  displayName: string | null
  role: string
  tier: string
  provinceSlug?: string | null
  districtSlug?: string | null
  categoryId?: string | null
}

const TIER_LABEL: Record<string, string> = {
  province_general: 'İl genel editörü',
  province_category: 'İl kategori editörü',
  district_general: 'İlçe genel editörü',
  district_category: 'İlçe kategori editörü',
}

type Tier = 'province_general' | 'district_general' | 'district_category'

/** What each tier can do inside its own section (enforced server-side). */
function rightsFor(tier: string): string[] {
  const base = ['Haber ekleme', 'Düzenleme', 'Resim/video ekleme', 'Bilgi ekleme', 'Onaylama/yayınlama', 'Reklam ekleme']
  return tier === 'province_general' ? [...base, 'Reklam onayı', 'Editör atama'] : base
}

export default function StaffTeamPage() {
  const [province, setProvince] = useState<string>(() => getCachedStaffScope()?.provinceSlug ?? 'canakkale')
  const [isSuper, setIsSuper] = useState(false)
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [tier, setTier] = useState<Tier>('district_general')
  const [district, setDistrict] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)

  const districts = useMemo(() => getDistrictsForProvince(province), [province])
  const provinceName = TURKISH_PROVINCES.find((p) => p.slug === province)?.name ?? province

  useEffect(() => {
    void loadMyStaffScope().then((s) => {
      setIsSuper(s?.role === 'super_admin')
      if (s?.provinceSlug) setProvince(s.provinceSlug)
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

  const assign = async () => {
    if (!username.trim()) return toast.error('Kullanıcı adı girin')
    setBusy(true)
    try {
      const look = await adminApiFetch(
        `/api/admin/staff/assignments?province=${province}&lookup=${encodeURIComponent(username.trim())}`
      )
      const found = (await look.json()) as { user: StaffRow | null; error?: string }
      if (!look.ok) throw new Error(found.error ?? 'Kullanıcı aranamadı')
      if (!found.user) throw new Error('Bu kullanıcı adıyla tek bir kullanıcı bulunamadı')
      const res = await adminApiFetch('/api/admin/staff/assignments', {
        method: 'POST',
        body: JSON.stringify({
          action: 'assign',
          targetUid: found.user.uid,
          tier,
          provinceSlug: province,
          ...(tier !== 'province_general' ? { districtSlug: district } : {}),
          ...(tier === 'district_category' ? { categoryId: category } : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Atama başarısız')
      toast.success('Editör atandı')
      setUsername('')
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Atama başarısız')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (row: StaffRow) => {
    if (!window.confirm(`${row.displayName ?? row.username ?? row.uid} editörlükten kaldırılsın mı?`)) return
    const res = await adminApiFetch('/api/admin/staff/assignments', {
      method: 'POST',
      body: JSON.stringify({ action: 'revoke', targetUid: row.uid }),
    })
    const body = await res.json()
    if (!res.ok) return toast.error(body.error ?? 'Kaldırılamadı')
    toast.success('Kaldırıldı')
    await refresh()
  }

  const districtName = (slug?: string | null) => districts.find((d) => d.slug === slug)?.name ?? slug ?? '—'
  const categoryName = (id?: string | null) => DEFAULT_CATEGORIES.find((c) => c.id === id)?.name ?? id ?? '—'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-bold">Ekibim — {provinceName}</h1>
        <p className="text-sm text-[rgb(var(--color-muted))]">
          İlçe genel editörleri ve ilçe kategori editörleri. Her editör yalnızca kendi ilçe/kategorisinde haber
          ekleyip düzenleyebilir.
        </p>
      </header>

      <section className="rounded-xl border border-[rgb(var(--color-border))] p-4">
        <h2 className="mb-3 font-semibold">Editör ata</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <input
            className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
            placeholder="Kullanıcı adı (profil adı)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <select className="rounded-lg border px-3 py-2 text-sm" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            {isSuper && <option value="province_general">İl genel editörü</option>}
            <option value="district_general">İlçe genel editörü</option>
            <option value="district_category">İlçe kategori editörü</option>
          </select>
          {tier !== 'province_general' && (
            <select className="rounded-lg border px-3 py-2 text-sm" value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">İlçe seçin</option>
              {districts.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {tier === 'district_category' && (
            <select className="rounded-lg border px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Kategori seçin</option>
              {DEFAULT_CATEGORIES.filter((c) => !c.parentId).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void assign()}
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Atanıyor…' : 'Ata'}
        </button>
      </section>

      <section className="rounded-xl border border-[rgb(var(--color-border))]">
        <table className="w-full text-sm">
          <thead className="text-left text-[rgb(var(--color-muted))]">
            <tr>
              <th className="p-3">Editör</th>
              <th className="p-3">Seviye</th>
              <th className="p-3">İlçe</th>
              <th className="p-3">Kategori</th>
              <th className="p-3">Yetkiler (kendi bölümünde)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-3" colSpan={6}>
                  Yükleniyor…
                </td>
              </tr>
            ) : staff.length === 0 ? (
              <tr>
                <td className="p-3" colSpan={6}>
                  Henüz editör yok.
                </td>
              </tr>
            ) : (
              staff.map((row) => (
                <tr key={row.uid} className="border-t border-[rgb(var(--color-border))]">
                  <td className="p-3">{row.displayName ?? row.username ?? row.uid}</td>
                  <td className="p-3">{TIER_LABEL[row.tier] ?? row.tier}</td>
                  <td className="p-3">{row.districtSlug ? districtName(row.districtSlug) : 'Tüm il'}</td>
                  <td className="p-3">{row.categoryId ? categoryName(row.categoryId) : 'Tümü'}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {rightsFor(row.tier).map((r) => (
                        <span key={r} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {(isSuper || row.tier.startsWith('district')) && (
                      <button type="button" className="text-red-600 hover:underline" onClick={() => void revoke(row)}>
                        Kaldır
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
