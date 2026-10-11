'use client'

/**
 * «Yayın kapsamı ve izinler» — NaHaber-side MANUAL publish scope of one
 * account. Separate from (a) the platform API permissions (shown read-only)
 * and (b) automation rules, which have their own triggers, limits, quiet
 * hours and on/off switch.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { TURKISH_PROVINCES, getDistrictsForProvince } from '@/constants/cities'
import type { AccountPublishScope } from '@/lib/social/accounts/publishScope'
import type { AutomationGeo } from '@/lib/social/automation/types'
import type { PublishFormat } from '@/lib/social/accounts/capabilities'
import { socialApi, type SocialAccountRow } from './socialClient'

const CATEGORY_OPTIONS = DEFAULT_CATEGORIES.filter((c) => !['trend', 'tekrarlayan'].includes(c.id)).map((c) => ({ id: c.id, name: c.name, child: !!c.parentId }))
const GEO_KINDS: Array<[AutomationGeo['kind'], string]> = [
  ['provinces', 'Belirli il(ler)'],
  ['districts', 'Belirli ilçe(ler)'],
  ['national', 'Ulusal haberler'],
  ['all_provinces', 'Tüm illerden haberler'],
  ['any', 'Tüm haberler (ulusal + yerel)'],
]
const FORMAT_TEXT: Record<PublishFormat, string> = { post: 'Görselli gönderi', story: 'Hikâye' }

export function PublishScopeEditor({
  account,
  provinceChoices,
  initialDistrict,
  onSaved,
  onClose,
  automationHref,
}: {
  account: SocialAccountRow & { publishScope: AccountPublishScope }
  /** Provinces the user may choose (il yöneticisi: own il only). */
  provinceChoices: Array<{ slug: string; name: string }>
  initialDistrict?: string | null
  onSaved: () => void
  onClose: () => void
  automationHref: string
}) {
  const init = account.publishScope
  const [geo, setGeo] = useState<AutomationGeo>(() => {
    if (initialDistrict && account.ownership.citySlug) return { kind: 'districts', citySlug: account.ownership.citySlug, districtSlugs: [initialDistrict] }
    return init.geo
  })
  const [allCategories, setAllCategories] = useState(init.allCategories)
  const [categoryIds, setCategoryIds] = useState<string[]>(init.categoryIds)
  const [formats, setFormats] = useState<PublishFormat[]>(init.formats)
  const [manualAccess, setManualAccess] = useState(init.manualAccess)
  const [saving, setSaving] = useState(false)
  const isCorporate = account.ownerKind === 'central' || account.ownerKind === 'province'
  const allowedKinds = useMemo(
    () => GEO_KINDS.filter(([k]) => provinceChoices.length >= 81 || account.ownerKind !== 'province' || k === 'provinces' || k === 'districts'),
    [account.ownerKind, provinceChoices.length],
  )

  const save = async () => {
    setSaving(true)
    const r = await socialApi<{ publishScope: AccountPublishScope }>(`/api/social/accounts/${encodeURIComponent(account.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'scope', scope: { geo, allCategories, categoryIds, formats, manualAccess } }),
    })
    setSaving(false)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    toast.success('Yayın kapsamı kaydedildi.')
    onSaved()
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="space-y-4 rounded-xl border border-blue-300 p-3 text-sm dark:border-blue-800" aria-label="Yayın kapsamı ve izinler">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">Yayın kapsamı ve izinler — {account.displayName}</h3>
          <p className="text-xs text-[rgb(var(--color-muted))]">
            NaHaber’in kendi kuralıdır; manuel paylaşımda hangi haberlerin bu hesaba gidebileceğini belirler. Platformun verdiği API izinleri ayrıdır ve aşağıda yalnız gösterilir.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs underline">
          Kapat
        </button>
      </div>

      <fieldset className="space-y-2">
        <legend className="font-semibold">Konum</legend>
        <div className="flex flex-wrap gap-3">
          {allowedKinds.map(([k, label]) => (
            <label key={k} className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={geo.kind === k}
                onChange={() =>
                  setGeo(
                    k === 'provinces'
                      ? { kind: 'provinces', citySlugs: account.ownership.citySlug ? [account.ownership.citySlug] : [] }
                      : k === 'districts'
                        ? { kind: 'districts', citySlug: account.ownership.citySlug ?? provinceChoices[0]?.slug ?? '', districtSlugs: [] }
                        : { kind: k },
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        {geo.kind === 'provinces' && (
          <div className="max-h-40 overflow-auto rounded-lg border border-[rgb(var(--color-border))] p-2">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {provinceChoices.map((p) => (
                <label key={p.slug} className="inline-flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={geo.citySlugs.includes(p.slug)} onChange={() => setGeo({ kind: 'provinces', citySlugs: toggle(geo.citySlugs, p.slug) })} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
        )}
        {geo.kind === 'districts' && (
          <div className="space-y-1">
            <select value={geo.citySlug} onChange={(e) => setGeo({ kind: 'districts', citySlug: e.target.value, districtSlugs: [] })} className="rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-xs">
              {provinceChoices.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="grid max-h-40 grid-cols-2 gap-1 overflow-auto rounded-lg border border-[rgb(var(--color-border))] p-2 sm:grid-cols-4">
              {getDistrictsForProvince(geo.citySlug).map((d) => (
                <label key={d.slug} className="inline-flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={geo.districtSlugs.includes(d.slug)} onChange={() => setGeo({ ...geo, districtSlugs: toggle(geo.districtSlugs, d.slug) })} />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-[rgb(var(--color-muted))]">Konumu kayıtlı olmayan haber ulusal ya da bir il sayılmaz; editörün konum sınıflandırması gerekir.</p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-semibold">İçerik</legend>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={allCategories} onChange={(e) => setAllCategories(e.target.checked)} />
          Tüm kategoriler
        </label>
        {!allCategories && (
          <div className="grid max-h-40 grid-cols-2 gap-1 overflow-auto rounded-lg border border-[rgb(var(--color-border))] p-2 sm:grid-cols-3">
            {CATEGORY_OPTIONS.map((c) => (
              <label key={c.id} className={`inline-flex items-center gap-1 text-xs ${c.child ? 'pl-3' : 'font-semibold'}`}>
                <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => setCategoryIds(toggle(categoryIds, c.id))} />
                {c.name}
              </label>
            ))}
          </div>
        )}
        <p className="text-[11px] text-[rgb(var(--color-muted))]">
          Öne çıkan türü ve VE/VEYA koşulları otomatik paylaşım kuralında tanımlanır. Manuel kapsam yalnız konum ve kategoriye bakar.
        </p>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="font-semibold">İzinli biçimler</legend>
        <div className="flex flex-wrap gap-3">
          {(['post', 'story'] as PublishFormat[]).map((f) => {
            const supported = account.formats.includes(f)
            return (
              <label key={f} className={`inline-flex items-center gap-1.5 ${supported ? '' : 'opacity-50'}`}>
                <input type="checkbox" disabled={!supported} checked={formats.includes(f)} onChange={() => setFormats(toggle(formats, f))} />
                {FORMAT_TEXT[f]}
                {!supported && ' (hesap desteklemiyor)'}
              </label>
            )
          })}
        </div>
        <p className="text-[11px] text-[rgb(var(--color-muted))]">Reels/video ve TikTok henüz doğrulanmış yayın desteğine sahip değil; seçenek olarak sunulmaz.</p>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="font-semibold">Manuel paylaşım: kimler kullanabilir?</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={manualAccess === 'managers'} onChange={() => setManualAccess('managers')} />
          Yalnız hesabı yönetenler{account.ownerKind === 'publisher' ? ' ve yayıncı editörleri' : ''}
        </label>
        {isCorporate && (
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={manualAccess === 'scope_editors'} onChange={() => setManualAccess('scope_editors')} />
            Yetki kapsamı bu hesabı içeren haber editörleri de
          </label>
        )}
      </fieldset>

      <div className="rounded-lg bg-[rgb(var(--color-surface))] p-2 text-xs">
        <p className="font-semibold">Platform API izinleri (platformdan gelir, burada değiştirilemez)</p>
        <p className="text-[rgb(var(--color-muted))]">
          {account.grantedPermissions?.length ? account.grantedPermissions.join(', ') : 'doğrulanmadı'} · gerekli: {account.requiredPermissions.join(', ')}
        </p>
      </div>

      <div className="rounded-lg bg-[rgb(var(--color-surface))] p-2 text-xs">
        <p className="font-semibold">Otomatik paylaşım ayrıdır</p>
        <p className="text-[rgb(var(--color-muted))]">
          Otomatik paylaşımın koşulları (örneğin yalnız Asayiş), günlük sınır, en az aralık ve sessiz saatler hesabın otomasyon kuralında tanımlanır ve ayrı açılır/kapatılır.{' '}
          <Link href={automationHref} className="font-semibold underline">
            Otomasyon kuralı oluştur / düzenle
          </Link>
        </p>
      </div>

      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Kaydet
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-1.5">
          Vazgeç
        </button>
      </div>
    </div>
  )
}

export const ALL_PROVINCES = TURKISH_PROVINCES.map((p) => ({ slug: p.slug, name: p.name }))
