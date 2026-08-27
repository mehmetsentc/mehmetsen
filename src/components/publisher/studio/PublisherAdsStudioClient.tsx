'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Archive, Eye, Megaphone, Plus, ToggleLeft } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import { PublisherStudioShell } from '@/components/publisher/studio/PublisherStudioShell'
import { formatPriceMinor } from '@/lib/publisher/adInventoryDomain'
import type { PublisherRecord } from '@/types/publisher'
import {
  AD_FORMAT_LABELS,
  AD_FORMATS,
  AD_INVENTORY_TYPE_LABELS,
  AD_INVENTORY_TYPES,
  AD_PLACEMENT_SCOPES,
  AD_PRICING_MODEL_LABELS,
  AD_PRICING_MODELS,
  AD_SALE_STATUS_LABELS,
  AD_SALE_STATUSES,
  type AdFormat,
  type AdInventoryCreateInput,
  type AdInventoryDashboardCounts,
  type AdInventoryType,
  type AdPlacementScope,
  type AdPricingModel,
  type AdSaleStatus,
  type PublisherAdInventoryRecord,
} from '@/types/publisherAdInventory'
import { ManagedAdsStudioPanel } from '@/components/publisher/studio/ManagedAdsStudioPanel'

type SerializedItem = Omit<PublisherAdInventoryRecord, 'createdAt' | 'updatedAt' | 'archivedAt'> & {
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

const EMPTY_DASH: AdInventoryDashboardCounts = {
  total: 0,
  active: 0,
  available: 0,
  reserved: 0,
  sold: 0,
  archived: 0,
  publiclyListed: 0,
}

function scopesForType(type: AdInventoryType): AdPlacementScope[] {
  return AD_PLACEMENT_SCOPES.filter((s) => {
    if (type === 'CUSTOM' || s === 'CUSTOM') return true
    if (type === 'PROFILE') return s.startsWith('PROFILE_')
    if (type === 'ARTICLE') return s.startsWith('ARTICLE_') || s === 'VIDEO_PRE_ROLL'
    if (type === 'SECTION') return s.startsWith('SECTION_')
    if (type === 'FEED') return s.startsWith('FEED_')
    return false
  })
}

export function PublisherAdsStudioClient({
  slug,
  publisher,
}: {
  slug: string
  publisher: PublisherRecord
}) {
  const [tab, setTab] = useState<'inventory' | 'managed' | 'requests' | 'bookings'>('inventory')
  const [items, setItems] = useState<SerializedItem[]>([])
  const [dashboard, setDashboard] = useState<AdInventoryDashboardCounts>(EMPTY_DASH)
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<
    Array<{
      id: string
      status: string
      inventoryId: string
      advertiserId: string
      priceSnapshotMinor: number | null
      currency: string
      message: string | null
      requestedStartAt: string
      requestedEndAt: string
    }>
  >([])
  const [bookings, setBookings] = useState<
    Array<{
      id: string
      status: string
      inventoryId: string
      advertiserId: string
      startAt: string
      endAt: string
      priceMinor: number | null
      currency: string
    }>
  >([])

  const [form, setForm] = useState<AdInventoryCreateInput>({
    name: '',
    inventoryType: 'PROFILE',
    placementScope: 'PROFILE_INLINE',
    format: 'BANNER',
    pricingModel: 'CONTACT_FOR_PRICE',
    priceMinor: null,
    saleStatus: 'NOT_FOR_SALE',
    isPubliclyListed: false,
  })

  const tokenHeaders = useCallback(async () => {
    const user = auth.currentUser
    if (!user) throw new Error('Giriş gerekli')
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisher.id}/ads`, { headers })
      if (!res.ok) throw new Error((await res.json()).error || 'Yüklenemedi')
      const data = (await res.json()) as { items: SerializedItem[]; dashboard: AdInventoryDashboardCounts }
      setItems(data.items)
      setDashboard(data.dashboard)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [publisher.id, tokenHeaders])

  const refreshRequests = useCallback(async () => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisher.id}/ads/requests`, { headers })
      if (!res.ok) return
      const data = await res.json()
      setIncoming(data.requests || [])
    } catch {
      /* flag may be off */
    }
  }, [publisher.id, tokenHeaders])

  const refreshBookings = useCallback(async () => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisher.id}/ads/bookings`, { headers })
      if (!res.ok) return
      const data = await res.json()
      setBookings(data.bookings || [])
    } catch {
      /* flag may be off */
    }
  }, [publisher.id, tokenHeaders])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => {
      void refresh()
      void refreshRequests()
      void refreshBookings()
    })
    return () => unsub()
  }, [refresh, refreshRequests, refreshBookings])

  const reviewRequest = async (
    requestId: string,
    action: 'approve' | 'reject' | 'offer',
    extra?: { note?: string; publisherOfferMinor?: number }
  ) => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisher.id}/ads/requests/${requestId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...extra }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'İşlem başarısız')
      toast.success(action === 'approve' ? 'Onaylandı (ödeme bekleniyor)' : action === 'reject' ? 'Reddedildi' : 'Teklif gönderildi')
      await refreshRequests()
      await refreshBookings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }

  const create = async () => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisher.id}/ads`, {
        method: 'POST',
        headers,
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Oluşturulamadı')
      toast.success('Envanter oluşturuldu')
      setWizardOpen(false)
      setForm({
        name: '',
        inventoryType: 'PROFILE',
        placementScope: 'PROFILE_INLINE',
        format: 'BANNER',
        pricingModel: 'CONTACT_FOR_PRICE',
        priceMinor: null,
        saleStatus: 'NOT_FOR_SALE',
        isPubliclyListed: false,
      })
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Oluşturulamadı')
    }
  }

  const patchSale = async (id: string, saleStatus: AdSaleStatus, isPubliclyListed?: boolean) => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisher.id}/ads/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'sale', saleStatus, isPubliclyListed }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Güncellenemedi')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Güncellenemedi')
    }
  }

  const archive = async (id: string) => {
    if (!confirm('Bu envanteri arşivlemek istiyor musunuz? (soft archive)')) return
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisher.id}/ads/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'archive' }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Arşivlenemedi')
      toast.success('Arşivlendi')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Arşivlenemedi')
    }
  }

  const previewItem = items.find((i) => i.id === previewId)

  return (
    <PublisherStudioShell slug={slug} publisher={publisher}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Megaphone className="h-6 w-6" aria-hidden />
            Reklamlar
          </h1>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
            Reklam alanları ve kendi yönettiğiniz reklamlar. Ödeme / marketplace kapalı.
          </p>
          <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">
            NaHaber ödeme almaz — reklam müşterinizi siz yönetirsiniz.
          </p>
        </div>
        {tab === 'inventory' ? (
          <button type="button" className="studio-btn-primary" onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Yeni alan
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-[rgb(var(--color-border))] pb-2 text-sm">
        {(
          [
            ['inventory', 'Reklam Alanları'],
            ['managed', 'Reklamlarım'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`rounded px-3 py-1.5 ${
              tab === key ? 'bg-[rgb(var(--color-fg))] text-[rgb(var(--color-bg))]' : 'opacity-70'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
        {/* P9 marketplace tabs — kept but visually de-emphasized; feature-off by default */}
        {(
          [
            ['requests', 'Gelen Talepler'],
            ['bookings', 'Rezervasyonlar'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`rounded px-3 py-1.5 opacity-50 ${
              tab === key ? 'bg-[rgb(var(--color-fg))] text-[rgb(var(--color-bg))] opacity-100' : ''
            }`}
            onClick={() => setTab(key)}
            title="Marketplace özelliği kapalı"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'managed' ? (
        <ManagedAdsStudioPanel publisherId={publisher.id} inventoryItems={items} />
      ) : null}

      {tab === 'requests' ? (
        <div className="mt-6 space-y-3">
          {incoming.length === 0 ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Gelen talep yok.</p>
          ) : (
            incoming.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-[rgb(var(--color-border))] p-4 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">{r.status}</span>
                  <span>
                    {formatPriceMinor(r.priceSnapshotMinor, r.currency) || 'Teklif / iletişim'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                  {new Date(r.requestedStartAt).toLocaleString('tr-TR')} →{' '}
                  {new Date(r.requestedEndAt).toLocaleString('tr-TR')}
                </p>
                {r.message ? <p className="mt-2">{r.message}</p> : null}
                {['SUBMITTED', 'UNDER_REVIEW', 'OFFERED'].includes(r.status) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="studio-btn-primary text-xs"
                      onClick={() => void reviewRequest(r.id, 'approve')}
                    >
                      Onayla
                    </button>
                    <button
                      type="button"
                      className="rounded border px-3 py-1 text-xs"
                      onClick={() => void reviewRequest(r.id, 'reject', { note: 'Uygun değil' })}
                    >
                      Reddet
                    </button>
                    <button
                      type="button"
                      className="rounded border px-3 py-1 text-xs"
                      onClick={() => {
                        const offer = prompt('Teklif (kuruş cinsinden, örn. 15000)')
                        if (offer == null) return
                        void reviewRequest(r.id, 'offer', {
                          publisherOfferMinor: Number(offer),
                        })
                      }}
                    >
                      Teklif Ver
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'bookings' ? (
        <div className="mt-6 space-y-3">
          {bookings.length === 0 ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Rezervasyon yok.</p>
          ) : (
            bookings.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-[rgb(var(--color-border))] p-4 text-sm"
              >
                <div className="flex justify-between">
                  <span className="font-semibold">
                    {b.status === 'PENDING_PAYMENT' ? 'Ödeme Bekliyor' : b.status}
                  </span>
                  <span>{formatPriceMinor(b.priceMinor, b.currency) || '—'}</span>
                </div>
                <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                  {new Date(b.startAt).toLocaleString('tr-TR')} →{' '}
                  {new Date(b.endAt).toLocaleString('tr-TR')} · envanter {b.inventoryId.slice(0, 12)}…
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
                  Bekleyen Kazanç (salt okunur · flag kapalı) — payout yok
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'inventory' ? (
        <>
      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ['Toplam', dashboard.total],
            ['Aktif', dashboard.active],
            ['Satışa açık', dashboard.available],
            ['Rezerve', dashboard.reserved],
            ['Satıldı', dashboard.sold],
            ['Listelenen', dashboard.publiclyListed],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[rgb(var(--color-border))] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              {label}
            </p>
            <p className="mt-1 text-xl font-black">{value}</p>
          </div>
        ))}
      </div>

      {wizardOpen ? (
        <div className="mt-6 space-y-3 rounded-xl border border-[rgb(var(--color-border))] p-4">
          <h2 className="font-bold">Yerleşim sihirbazı</h2>
          <label className="block text-sm">
            <span className="font-semibold">Ad</span>
            <input
              className="mt-1 w-full rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Örn. Profil üst banner"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">Tür</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.inventoryType}
                onChange={(e) => {
                  const inventoryType = e.target.value as AdInventoryType
                  const scopes = scopesForType(inventoryType)
                  setForm({
                    ...form,
                    inventoryType,
                    placementScope: scopes[0] ?? 'CUSTOM',
                  })
                }}
              >
                {AD_INVENTORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {AD_INVENTORY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Yerleşim</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.placementScope}
                onChange={(e) =>
                  setForm({ ...form, placementScope: e.target.value as AdPlacementScope })
                }
              >
                {scopesForType(form.inventoryType).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Format</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as AdFormat })}
              >
                {AD_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {AD_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Fiyatlandırma</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.pricingModel}
                onChange={(e) =>
                  setForm({ ...form, pricingModel: e.target.value as AdPricingModel })
                }
              >
                {AD_PRICING_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {AD_PRICING_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {form.pricingModel !== 'CONTACT_FOR_PRICE' ? (
            <label className="block text-sm">
              <span className="font-semibold">Fiyat (kuruş)</span>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.priceMinor ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    priceMinor: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                placeholder="15000 = 150,00 ₺"
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="studio-btn-primary" onClick={() => void create()}>
              Oluştur
            </button>
            <button type="button" className="studio-btn" onClick={() => setWizardOpen(false)}>
              İptal
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[rgb(var(--color-muted))]">Henüz reklam alanı yok.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-[rgb(var(--color-border))] p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">{item.name}</p>
                <p className="mt-0.5 text-xs text-[rgb(var(--color-muted))]">
                  {AD_INVENTORY_TYPE_LABELS[item.inventoryType]} · {item.placementScope} ·{' '}
                  {AD_FORMAT_LABELS[item.format]} · {AD_SALE_STATUS_LABELS[item.saleStatus]}
                  {item.priceMinor != null
                    ? ` · ${formatPriceMinor(item.priceMinor, item.currency)}`
                    : ' · Fiyat için iletişim'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="studio-btn"
                  onClick={() => setPreviewId(item.id)}
                  title="Önizleme"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <select
                  className="rounded border px-2 py-1 text-xs"
                  value={item.saleStatus}
                  onChange={(e) => void patchSale(item.id, e.target.value as AdSaleStatus)}
                >
                  {AD_SALE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {AD_SALE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="studio-btn"
                  onClick={() =>
                    void patchSale(
                      item.id,
                      item.saleStatus === 'AVAILABLE' ? item.saleStatus : 'AVAILABLE',
                      !item.isPubliclyListed
                    )
                  }
                  title="Genel liste"
                >
                  <ToggleLeft className="h-4 w-4" />
                  {item.isPubliclyListed ? 'Listede' : 'Gizli'}
                </button>
                <button type="button" className="studio-btn" onClick={() => void archive(item.id)}>
                  <Archive className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {previewItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-md rounded-xl bg-[rgb(var(--color-surface))] p-6 shadow-xl">
            <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              REKLAM ALANI · Önizleme
            </p>
            <p className="mt-2 text-lg font-black">{previewItem.name}</p>
            <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">
              {previewItem.placementScope} · {AD_FORMAT_LABELS[previewItem.format]}
            </p>
            <div className="mt-4 flex aspect-[3/1] items-center justify-center rounded-lg border border-dashed border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] text-sm font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">
              Satışa açık alan — gerçek reklam değil
            </div>
            <button type="button" className="studio-btn mt-4" onClick={() => setPreviewId(null)}>
              Kapat
            </button>
          </div>
        </div>
      ) : null}
        </>
      ) : null}
    </PublisherStudioShell>
  )
}
