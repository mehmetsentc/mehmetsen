'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { auth } from '@/lib/firebase/auth'
import { formatPriceMinor } from '@/lib/publisher/adInventoryDomain'
import { PublisherAdSlotPlaceholder } from '@/components/publisher/PublisherAdSlotPlaceholder'
import type { MarketplaceInventoryCard } from '@/types/advertiserMarketplace'
import type { AdSemanticSize } from '@/types/publisherAdInventory'

export function InventoryDetailClient({ inventoryId }: { inventoryId: string }) {
  const search = useSearchParams()
  const advertiserId = search.get('advertiserId') || ''
  const [item, setItem] = useState<MarketplaceInventoryCard | null>(null)
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([])
  const [campaignId, setCampaignId] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [message, setMessage] = useState('')
  const [impressions, setImpressions] = useState('')
  const [showForm, setShowForm] = useState(Boolean(advertiserId))

  useEffect(() => {
    void fetch(`/api/marketplace/inventory/${inventoryId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || 'Bulunamadı')
        return res.json()
      })
      .then((data) => setItem(data.item))
      .catch((err) => toast.error(err.message))
  }, [inventoryId])

  const loadCampaigns = useCallback(async () => {
    if (!advertiserId) return
    const user = auth.currentUser
    if (!user) return
    const token = await user.getIdToken()
    const res = await fetch(`/api/advertiser/${advertiserId}/campaigns`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    setCampaigns(data.campaigns || [])
    if (data.campaigns?.[0]?.id) setCampaignId(data.campaigns[0].id)
  }, [advertiserId])

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => {
      void loadCampaigns()
    })
    return () => unsub()
  }, [loadCampaigns])

  const submit = async () => {
    try {
      const user = auth.currentUser
      if (!user || !advertiserId) throw new Error('Giriş ve reklamveren hesabı gerekli')
      const token = await user.getIdToken()
      const res = await fetch(`/api/advertiser/${advertiserId}/requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          inventoryId,
          requestedStartAt: new Date(startAt).toISOString(),
          requestedEndAt: new Date(endAt).toISOString(),
          message: message || null,
          requestedImpressions: impressions ? Number(impressions) : null,
          submit: true,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Gönderilemedi')
      toast.success('Talep gönderildi (ödeme yok)')
      setShowForm(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hata')
    }
  }

  if (!item) {
    return <p className="p-8 text-stone-500">Yükleniyor…</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <Link href="/reklam-pazari" className="text-sm text-stone-600 underline">
        ← Pazar yerine dön
      </Link>
      <header>
        <h1 className="text-3xl font-semibold text-stone-900">{item.name}</h1>
        <p className="mt-1 text-stone-600">
          {item.publisher.displayName}
          {item.publisher.city ? ` · ${item.publisher.city}` : ''} · Doğrulanmış
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-stone-500">Yerleşim</dt>
          <dd>{item.placementScope}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Format</dt>
          <dd>{item.format}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Fiyat modeli</dt>
          <dd>{item.pricingModel}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Fiyat</dt>
          <dd>{formatPriceMinor(item.priceMinor, item.currency) || 'İletişim'}</dd>
        </div>
        {item.periodDays ? (
          <div>
            <dt className="text-stone-500">Süre</dt>
            <dd>{item.periodDays} gün</dd>
          </div>
        ) : null}
        {item.impressionCap ? (
          <div>
            <dt className="text-stone-500">Gösterim paketi</dt>
            <dd>{item.impressionCap}</dd>
          </div>
        ) : null}
      </dl>

      {item.description ? <p className="text-stone-700">{item.description}</p> : null}

      <section>
        <h2 className="mb-2 text-lg font-medium">Bu alan nerede görünür?</h2>
        <PublisherAdSlotPlaceholder
          name={item.name}
          semanticSize={'STANDARD' as AdSemanticSize}
          saleStatus="AVAILABLE"
          priceMinor={item.priceMinor}
          currency={item.currency}
        />
      </section>

      <section className="border-t border-stone-200 pt-6">
        {!showForm ? (
          <button
            type="button"
            className="rounded bg-stone-900 px-4 py-2 text-white"
            onClick={() => setShowForm(true)}
          >
            Talep Oluştur
          </button>
        ) : !advertiserId ? (
          <p className="text-sm">
            Talep için{' '}
            <Link href="/advertiser/onboarding" className="underline">
              reklamveren hesabı
            </Link>{' '}
            gerekli.
          </p>
        ) : (
          <div className="space-y-3">
            <h3 className="font-medium">Rezervasyon talebi</h3>
            <select
              className="w-full rounded border px-3 py-2 text-sm"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="datetime-local"
                className="rounded border px-3 py-2 text-sm"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
              <input
                type="datetime-local"
                className="rounded border px-3 py-2 text-sm"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
            {item.pricingModel === 'FIXED_IMPRESSIONS' ? (
              <input
                type="number"
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="İstenen gösterim"
                value={impressions}
                onChange={(e) => setImpressions(e.target.value)}
              />
            ) : null}
            <textarea
              className="w-full rounded border px-3 py-2 text-sm"
              rows={3}
              placeholder="Mesaj"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-xs text-stone-500">
              Fiyat özeti (sunucu anlık görüntüsü):{' '}
              {formatPriceMinor(item.priceMinor, item.currency) || 'Teklif ile belirlenecek'} — ödeme
              yok.
            </p>
            <button
              type="button"
              className="rounded bg-amber-800 px-4 py-2 text-white"
              onClick={() => void submit()}
            >
              Talebi Gönder
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
