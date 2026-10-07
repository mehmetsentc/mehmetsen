'use client'

/**
 * Phase 2D — edit one person's editor access: il genel editörü, or "bölüm editörü"
 * with several areas (ilçe × kategori) inside ONE il and six rights per area that
 * are granted one by one (new areas start with no rights).
 * Server: /api/admin/staff/assignments (all rules enforced there).
 */
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, X } from 'lucide-react'
import { getDistrictsForProvince, isTurkishProvinceSlug, normalizeCitySlug, TURKISH_PROVINCES } from '@/constants/cities'
import { parseStaffScope, staffTierOf } from '@/lib/cms/rbacScope'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { adminApiFetch } from '@/lib/cms/staffScopeClient'
import { STAFF_RIGHTS, STAFF_RIGHT_LABELS, type StaffRight } from '@/lib/cms/staffRights'
import { STAFF_HIERARCHY_ACTIVE_PROVINCES } from '@/lib/cms/staffHierarchy'

export interface StaffAccessTarget {
  uid: string
  displayName?: string | null
  username?: string | null
  tier?: string | null
  provinceSlug?: string | null
  sections?: Array<{ districtSlug: string | null; categoryId: string | null; rights: StaffRight[] }> | null
}

interface SectionDraft {
  key: string
  districtSlug: string
  categoryId: string
  rights: StaffRight[]
}

let keySeq = 0
const newKey = () => `s${++keySeq}`

export function StaffAccessEditor({
  target,
  isSuperAdmin,
  fixedProvince,
  onClose,
  onSaved,
}: {
  target: StaffAccessTarget
  isSuperAdmin: boolean
  /** il genel editörü: own province only. */
  fixedProvince?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [province, setProvince] = useState(
    fixedProvince || target.provinceSlug || STAFF_HIERARCHY_ACTIVE_PROVINCES[0] || 'canakkale'
  )
  const [mode, setMode] = useState<'province_general' | 'sections'>(
    target.tier === 'province_general' ? 'province_general' : 'sections'
  )
  const [sections, setSections] = useState<SectionDraft[]>(() =>
    target.sections?.length
      ? target.sections.map((s) => ({ key: newKey(), districtSlug: s.districtSlug ?? '', categoryId: s.categoryId ?? '', rights: [...s.rights] }))
      : [{ key: newKey(), districtSlug: '', categoryId: '', rights: [] }]
  )
  const [saving, setSaving] = useState(false)
  const districts = useMemo(() => getDistrictsForProvince(province), [province])
  const categories = useMemo(() => DEFAULT_CATEGORIES.filter((c) => !c.parentId && c.id !== 'trend'), [])
  const name = target.displayName || (target.username ? `@${target.username}` : target.uid)
  const isEditor = Boolean(target.tier && target.tier !== 'unscoped')

  const update = (key: string, patch: Partial<SectionDraft>) =>
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  const toggleRight = (key: string, right: StaffRight) =>
    setSections((prev) =>
      prev.map((s) =>
        s.key === key
          ? { ...s, rights: s.rights.includes(right) ? s.rights.filter((r) => r !== right) : [...s.rights, right] }
          : s
      )
    )

  const post = async (body: Record<string, unknown>, ok: string) => {
    setSaving(true)
    try {
      const res = await adminApiFetch('/api/admin/staff/assignments', { method: 'POST', body: JSON.stringify(body) })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'İşlem başarısız')
      toast.success(ok)
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setSaving(false)
    }
  }

  const save = () => {
    if (mode === 'province_general') {
      return post({ action: 'assign', targetUid: target.uid, tier: 'province_general', provinceSlug: province }, 'İl genel editörü atandı')
    }
    if (sections.some((s) => !s.districtSlug && !s.categoryId)) {
      return toast.error('Her bölüm için ilçe veya kategori seçin')
    }
    return post(
      {
        action: 'set_sections',
        targetUid: target.uid,
        provinceSlug: province,
        sections: sections.map((s) => ({ districtSlug: s.districtSlug || null, categoryId: s.categoryId || null, rights: s.rights })),
      },
      'Editör yetkileri kaydedildi'
    )
  }

  const provinceOptions = TURKISH_PROVINCES.filter((p) => STAFF_HIERARCHY_ACTIVE_PROVINCES.includes(p.slug))

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[rgb(var(--color-card))] shadow-xl">
        <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Editör yetkileri</h2>
            <p className="text-sm text-[rgb(var(--color-muted))]">{name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-[rgb(var(--color-surface))]" aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">İl</span>
              <select
                value={province}
                disabled={Boolean(fixedProvince)}
                onChange={(e) => {
                  setProvince(e.target.value)
                  setSections([{ key: newKey(), districtSlug: '', categoryId: '', rights: [] }])
                }}
                className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2"
              >
                {provinceOptions.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-[rgb(var(--color-muted))]">Görev</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2"
              >
                {isSuperAdmin && <option value="province_general">İl genel editörü (tüm il, tüm yetkiler)</option>}
                <option value="sections">Bölüm editörü (seçilen ilçe/kategoriler)</option>
              </select>
            </label>
          </div>

          {mode === 'sections' ? (
            <div className="space-y-3">
              <p className="text-xs text-[rgb(var(--color-muted))]">
                Her satır bir sorumluluk alanıdır. Yetkiler tek tek işaretlenir; işaretlenmeyen yetki kapalıdır.
              </p>
              {sections.map((s, i) => (
                <div key={s.key} className="rounded-xl border border-[rgb(var(--color-border))] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">Bölüm {i + 1}</span>
                    {sections.length > 1 && (
                      <button type="button" onClick={() => setSections((p) => p.filter((x) => x.key !== s.key))} className="rounded-lg p-1 text-red-600 hover:bg-red-500/10" aria-label="Bölümü sil">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <select value={s.districtSlug} onChange={(e) => update(s.key, { districtSlug: e.target.value })} className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm">
                      <option value="">Tüm ilçeler</option>
                      {districts.map((d) => (
                        <option key={d.slug} value={d.slug}>{d.name}</option>
                      ))}
                    </select>
                    <select value={s.categoryId} onChange={(e) => update(s.key, { categoryId: e.target.value })} className="rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2 text-sm">
                      <option value="">Tüm kategoriler</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {STAFF_RIGHTS.map((r) => (
                      <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[rgb(var(--color-border))] px-2 py-1.5 text-sm">
                        <input type="checkbox" checked={s.rights.includes(r)} onChange={() => toggleRight(s.key, r)} />
                        {STAFF_RIGHT_LABELS[r]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSections((p) => [...p, { key: newKey(), districtSlug: '', categoryId: '', rights: [] }])}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-500/10"
              >
                <Plus className="h-4 w-4" /> Bölüm ekle
              </button>
            </div>
          ) : (
            <p className="rounded-xl bg-[rgb(var(--color-surface))] p-3 text-sm">
              İl genel editörü ilin tüm haberlerini yönetir, ilçe/bölüm editörlerini atar ve yerel reklamları onaylar.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[rgb(var(--color-border))] px-5 py-4">
          {isEditor ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (window.confirm(`${name} editörlükten kaldırılsın mı?`)) {
                  void post({ action: 'revoke', targetUid: target.uid }, 'Editörlükten kaldırıldı')
                }
              }}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
            >
              Editörlükten kaldır
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]">
              İptal
            </button>
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Short Turkish summary of a person's editor access (table cells). */
export function describeStaffAccess(t: StaffAccessTarget): string {
  if (!t.tier || t.tier === 'unscoped') return ''
  const prov = TURKISH_PROVINCES.find((p) => p.slug === t.provinceSlug)?.name ?? t.provinceSlug ?? ''
  if (t.tier === 'province_general') return `${prov} · İl genel editörü`
  if (t.sections?.length) {
    const dn = (slug: string | null) =>
      slug ? getDistrictsForProvince(t.provinceSlug ?? '').find((d) => d.slug === slug)?.name ?? slug : 'Tüm ilçeler'
    const cn = (id: string | null) => (id ? DEFAULT_CATEGORIES.find((c) => c.id === id)?.name ?? id : 'Tüm kategoriler')
    return `${prov} · ` + t.sections.map((s) => `${dn(s.districtSlug)} / ${cn(s.categoryId)}`).join(', ')
  }
  return `${prov} · ${t.tier}`
}

/** Build the editor-access view of a raw users/{uid} doc (client side, display only). */
export function staffAccessFromUserDoc(uid: string, data: Record<string, unknown>): StaffAccessTarget {
  const state = parseStaffScope(
    data.cmsScope,
    (s) => isTurkishProvinceSlug(s) && normalizeCitySlug(s) === s,
    (d, p) => getDistrictsForProvince(p).some((x) => x.slug === d)
  )
  const scope = state.kind === 'scoped' ? state.scope : null
  return {
    uid,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    username: typeof data.username === 'string' ? data.username : null,
    tier: staffTierOf(state),
    provinceSlug: scope?.provinceSlugs[0] ?? null,
    sections: scope?.sections ?? null,
  }
}
