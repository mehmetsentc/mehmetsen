'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Archive, BarChart3, Plus } from 'lucide-react'
import { auth } from '@/lib/firebase/auth'
import {
  AD_CREATIVE_TYPE_LABELS,
  MANAGED_AD_STATUS_LABELS,
  type PublisherAdCreativeType,
  type PublisherManagedAdStatus,
} from '@/types/publisherManagedAds'
import type { PublisherAdInventoryRecord } from '@/types/publisherAdInventory'

type SerializedAd = {
  id: string
  name: string
  advertiserName: string
  inventoryId: string
  status: PublisherManagedAdStatus
  startAt: string
  endAt: string
  destinationUrl: string | null
  internalNote: string | null
}

type AnalyticsSummary = {
  impressions: number
  clicks: number
  ctr: number
  byAd: Array<{ adId: string; impressions: number; clicks: number; ctr: number }>
}

type ManagedTab = 'all' | 'ACTIVE' | 'SCHEDULED' | 'ENDED'

const CREATIVE_TYPES: PublisherAdCreativeType[] = [
  'IMAGE_BANNER',
  'NATIVE_CARD',
  'VIDEO',
  'SPONSORED_CARD',
]

export function ManagedAdsStudioPanel({
  publisherId,
  inventoryItems,
}: {
  publisherId: string
  inventoryItems: Array<Pick<PublisherAdInventoryRecord, 'id' | 'name' | 'placementScope'>>
}) {
  const [tab, setTab] = useState<ManagedTab>('all')
  const [ads, setAds] = useState<SerializedAd[]>([])
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d')

  const [form, setForm] = useState({
    name: '',
    advertiserName: '',
    inventoryId: '',
    destinationUrl: '',
    startAt: '',
    endAt: '',
    internalNote: '',
    status: 'DRAFT' as PublisherManagedAdStatus,
    creativeType: 'IMAGE_BANNER' as PublisherAdCreativeType,
    mediaFile: null as File | null,
    headline: '',
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
      const qs = tab === 'all' ? '' : `?status=${tab}`
      const res = await fetch(`/api/publisher-studio/${publisherId}/managed-ads${qs}`, {
        headers,
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Yüklenemedi')
      const data = (await res.json()) as { items: SerializedAd[] }
      setAds(data.items)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [publisherId, tab, tokenHeaders])

  const refreshAnalytics = useCallback(async () => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(
        `/api/publisher-studio/${publisherId}/managed-ads/analytics?range=${range}`,
        { headers }
      )
      if (!res.ok) {
        setAnalytics(null)
        return
      }
      const data = (await res.json()) as AnalyticsSummary
      setAnalytics(data)
    } catch {
      setAnalytics(null)
    }
  }, [publisherId, range, tokenHeaders])

  useEffect(() => {
    void refresh()
    void refreshAnalytics()
  }, [refresh, refreshAnalytics])

  const createAd = async () => {
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisherId}/managed-ads`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: form.name,
          advertiserName: form.advertiserName,
          inventoryId: form.inventoryId,
          destinationUrl: form.destinationUrl || null,
          startAt: form.startAt ? new Date(form.startAt).toISOString() : undefined,
          endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
          internalNote: form.internalNote || null,
          status: form.status,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Oluşturulamadı')
      const { item } = (await res.json()) as { item: SerializedAd }

      if (form.mediaFile) {
        const user = auth.currentUser
        if (!user) throw new Error('Giriş gerekli')
        const token = await user.getIdToken()
        const fd = new FormData()
        fd.append('file', form.mediaFile)
        const up = await fetch(
          `/api/publisher-studio/${publisherId}/managed-ads/${item.id}/media`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          }
        )
        if (!up.ok) throw new Error((await up.json()).error || 'Medya yüklenemedi')
        const { media } = (await up.json()) as { media: { url: string } }
        const cr = await fetch(
          `/api/publisher-studio/${publisherId}/managed-ads/${item.id}/creative`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              creativeType: form.creativeType,
              mediaUrl: media.url,
              headline: form.headline || null,
            }),
          }
        )
        if (!cr.ok) throw new Error((await cr.json()).error || 'Kreatif kaydedilemedi')
      }

      toast.success('Reklam oluşturuldu')
      setWizardOpen(false)
      setForm({
        name: '',
        advertiserName: '',
        inventoryId: '',
        destinationUrl: '',
        startAt: '',
        endAt: '',
        internalNote: '',
        status: 'DRAFT',
        creativeType: 'IMAGE_BANNER',
        mediaFile: null,
        headline: '',
      })
      await refresh()
      await refreshAnalytics()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Oluşturulamadı')
    }
  }

  const archive = async (id: string) => {
    if (!confirm('Bu reklamı arşivlemek istiyor musunuz?')) return
    try {
      const headers = await tokenHeaders()
      const res = await fetch(`/api/publisher-studio/${publisherId}/managed-ads/${id}`, {
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

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-sm">
          {(
            [
              ['all', 'Reklamlarım'],
              ['ACTIVE', 'Aktif'],
              ['SCHEDULED', 'Planlanan'],
              ['ENDED', 'Biten'],
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
        </div>
        <button type="button" className="studio-btn-primary" onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Yeni reklam
        </button>
      </div>

      {analytics ? (
        <div className="rounded-xl border border-[rgb(var(--color-border))] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <BarChart3 className="h-4 w-4" aria-hidden />
              Analitik
            </h3>
            <div className="flex gap-1 text-xs">
              {(['today', '7d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`rounded px-2 py-1 ${range === r ? 'bg-[rgb(var(--color-fg))] text-[rgb(var(--color-bg))]' : 'border'}`}
                  onClick={() => setRange(r)}
                >
                  {r === 'today' ? 'Bugün' : r === '7d' ? '7 gün' : '30 gün'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase text-[rgb(var(--color-muted))]">Gösterim</p>
              <p className="text-lg font-black">{analytics.impressions}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[rgb(var(--color-muted))]">Tıklama</p>
              <p className="text-lg font-black">{analytics.clicks}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-[rgb(var(--color-muted))]">CTR</p>
              <p className="text-lg font-black">{(analytics.ctr * 100).toFixed(2)}%</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-[rgb(var(--color-muted))]">
            Gelir / kazanç yok — yayıncı kendi müşterisini yönetir.
          </p>
        </div>
      ) : null}

      {wizardOpen ? (
        <div className="space-y-3 rounded-xl border border-[rgb(var(--color-border))] p-4">
          <h2 className="font-bold">Yeni reklam</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">Reklam adı</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Reklam veren</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.advertiserName}
                onChange={(e) => setForm({ ...form, advertiserName: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Envanter alanı</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.inventoryId}
                onChange={(e) => setForm({ ...form, inventoryId: e.target.value })}
              >
                <option value="">Seçin</option>
                {inventoryItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.placementScope})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Hedef URL</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.destinationUrl}
                onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })}
                placeholder="https://"
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Başlangıç</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Bitiş</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Kreatif türü</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.creativeType}
                onChange={(e) =>
                  setForm({ ...form, creativeType: e.target.value as PublisherAdCreativeType })
                }
              >
                {CREATIVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {AD_CREATIVE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-semibold">Durum</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as PublisherManagedAdStatus })
                }
              >
                {(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED'] as const).map((s) => (
                  <option key={s} value={s}>
                    {MANAGED_AD_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Medya (jpeg/png/webp/avif/mp4/webm)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
                className="mt-1 w-full text-sm"
                onChange={(e) =>
                  setForm({ ...form, mediaFile: e.target.files?.[0] ?? null })
                }
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">Başlık (opsiyonel)</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">İç not (opsiyonel)</span>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2"
                rows={2}
                value={form.internalNote}
                onChange={(e) => setForm({ ...form, internalNote: e.target.value })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" className="studio-btn-primary" onClick={() => void createAd()}>
              Kaydet
            </button>
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setWizardOpen(false)}>
              İptal
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</p>
      ) : ads.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Henüz reklam yok.</p>
      ) : (
        <ul className="space-y-3">
          {ads.map((ad) => (
            <li
              key={ad.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[rgb(var(--color-border))] p-4"
            >
              <div>
                <p className="font-bold">{ad.name}</p>
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  {ad.advertiserName} · {MANAGED_AD_STATUS_LABELS[ad.status]}
                </p>
                <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
                  {new Date(ad.startAt).toLocaleString('tr-TR')} →{' '}
                  {new Date(ad.endAt).toLocaleString('tr-TR')}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                onClick={() => void archive(ad.id)}
              >
                <Archive className="h-3 w-3" aria-hidden />
                Arşivle
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
