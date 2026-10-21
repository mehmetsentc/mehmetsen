'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { reelsCall } from '@/components/admin/social/reelsApi'

type Place = { key: string; placeId: string | null; name?: string | null; source: 'manual' | 'auto'; checkedAt: number; note?: string | null }

function statusText(p: Place): string {
  if (p.source === 'manual' && p.placeId) return 'Elle girildi'
  if (p.placeId) return 'Otomatik bulundu'
  if (p.note?.startsWith('search_unavailable')) return 'Otomatik arama kapalı (Meta izni yok)'
  if (p.note === 'no_match') return 'Otomatik aramada bulunamadı'
  return 'Yok'
}

/** SOCIAL-SEO-1 — il / ilçe → Facebook yer sayfası (Instagram ve Facebook konum etiketi). */
export default function SocialPlacesPage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({ citySlug: '', districtSlug: '', placeId: '', name: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await reelsCall<{ places: Place[] }>('GET', '/api/admin/social/places')
    if (r.ok) setPlaces(r.data.places)
    else setErr(r.error)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const save = async (override?: Partial<typeof form>) => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    const r = await reelsCall<{ key: string; placeId: string | null }>('POST', '/api/admin/social/places', { ...form, ...override })
    setBusy(false)
    if (!r.ok) return setErr(r.error)
    setMsg(r.data.placeId ? `Kaydedildi: ${r.data.key} → ${r.data.placeId}` : `Temizlendi: ${r.data.key}`)
    setForm({ citySlug: '', districtSlug: '', placeId: '', name: '' })
    void load()
  }

  const input = 'w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm'

  return (
    <AdminOsPageShell title="Konumlar" subtitle="Paylaşımlarda haberin konumu (Instagram, Facebook)">
      <SocialAdminNav />
      <div className="space-y-4 text-sm">
        <p className="text-[rgb(var(--color-muted))]">
          Instagram ve Facebook konum etiketi için şehrin ya da ilçenin Facebook yer sayfası kimliği gerekir. Sistem önce
          buradaki listeye bakar (önce ilçe, sonra il), sonra otomatik arar. Kimlik yoksa paylaşım konum etiketsiz gider;
          açıklamada yine «📍 İlçe, İl» yazar. Kimliği, Facebook&apos;ta yer sayfasını açıp adres çubuğundaki rakamdan ya da
          sayfa bilgilerinden alabilirsiniz; bağlantıyı da yapıştırabilirsiniz.
        </p>
        <div className="grid gap-2 rounded-xl border border-[rgb(var(--color-border))] p-3 sm:grid-cols-5">
          <input className={input} placeholder="il (canakkale)" value={form.citySlug} onChange={(e) => setForm({ ...form, citySlug: e.target.value })} />
          <input className={input} placeholder="ilçe (gelibolu) — boş: il" value={form.districtSlug} onChange={(e) => setForm({ ...form, districtSlug: e.target.value })} />
          <input className={input} placeholder="Facebook yer kimliği / bağlantı" value={form.placeId} onChange={(e) => setForm({ ...form, placeId: e.target.value })} />
          <input className={input} placeholder="ad (isteğe bağlı)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-60">
            Kaydet
          </button>
        </div>
        {msg ? <p className="text-emerald-600">{msg}</p> : null}
        {err ? <p className="text-red-600">{err}</p> : null}
        <div className="overflow-x-auto rounded-xl border border-[rgb(var(--color-border))]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[rgb(var(--color-surface-raised))]">
              <tr>
                <th className="px-3 py-2">İl / ilçe</th>
                <th className="px-3 py-2">Kimlik</th>
                <th className="px-3 py-2">Ad</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {places.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-[rgb(var(--color-muted))]" colSpan={5}>
                    Henüz kayıt yok. İlk paylaşımlarda otomatik arama sonuçları burada görünür.
                  </td>
                </tr>
              ) : (
                places.map((p) => {
                  const [city, district] = p.key.split('__')
                  return (
                    <tr key={p.key} className="border-t border-[rgb(var(--color-border))]">
                      <td className="px-3 py-2 font-semibold">{district ? `${district}, ${city}` : city}</td>
                      <td className="px-3 py-2 font-mono">{p.placeId ?? '—'}</td>
                      <td className="px-3 py-2">{p.name ?? '—'}</td>
                      <td className="px-3 py-2">{statusText(p)}</td>
                      <td className="px-3 py-2 text-right">
                        {p.source === 'manual' && p.placeId ? (
                          <button type="button" className="text-red-600 underline" onClick={() => void save({ citySlug: city, districtSlug: district ?? '', placeId: '' })}>
                            Temizle
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminOsPageShell>
  )
}
