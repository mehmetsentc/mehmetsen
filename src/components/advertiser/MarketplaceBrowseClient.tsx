'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { auth } from '@/lib/firebase/auth'
import { formatPriceMinor } from '@/lib/publisher/adInventoryDomain'
import type { MarketplaceInventoryCard } from '@/types/advertiserMarketplace'

export function MarketplaceBrowseClient({
  advertiserId,
  preferredCity,
}: {
  advertiserId?: string
  preferredCity?: string
}) {
  const [items, setItems] = useState<MarketplaceInventoryCard[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [city, setCity] = useState(preferredCity || '')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('recommended')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (append = false, cursorArg: string | null = null) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (city) params.set('city', city)
        if (q) params.set('q', q)
        if (sort) params.set('sort', sort)
        if (preferredCity) params.set('preferredCity', preferredCity)
        if (cursorArg) params.set('cursor', cursorArg)
        const res = await fetch(`/api/marketplace/inventory?${params}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Yüklenemedi')
        }
        const data = (await res.json()) as {
          items: MarketplaceInventoryCard[]
          nextCursor: string | null
        }
        setItems((prev) => (append ? [...prev, ...data.items] : data.items))
        setNextCursor(data.nextCursor)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Hata')
      } finally {
        setLoading(false)
      }
    },
    [city, q, sort, preferredCity]
  )

  useEffect(() => {
    void load(false, null)
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <input
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          placeholder="Şehir"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <input
          className="min-w-[200px] flex-1 rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          placeholder="Ara: yayıncı / alan"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recommended">Önerilen</option>
          <option value="price_asc">Fiyat düşük</option>
          <option value="price_desc">Fiyat yüksek</option>
          <option value="newest">En yeni alanlar</option>
        </select>
        <button
          type="button"
          className="rounded bg-stone-900 px-4 py-2 text-sm text-white"
          onClick={() => void load(false, null)}
        >
          Filtrele
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading && items.length === 0 ? <p className="text-sm text-stone-500">Yükleniyor…</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.inventoryId}
            className="border-b border-stone-200 bg-white/60 p-4 backdrop-blur"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-stone-900">{item.name}</h3>
                <p className="text-sm text-stone-600">
                  {item.publisher.displayName}
                  {item.publisher.verificationStatus === 'VERIFIED' ? ' · ✓' : ''}
                  {item.publisher.city ? ` · ${item.publisher.city}` : ''}
                </p>
              </div>
              <p className="text-sm font-medium text-stone-800">
                {formatPriceMinor(item.priceMinor, item.currency) || 'Fiyat için iletişime geçin'}
              </p>
            </div>
            <p className="mb-3 text-xs text-stone-500">
              {item.placementScope} · {item.format} · {item.pricingModel}
            </p>
            <div className="flex gap-3 text-sm">
              <Link
                href={`/reklam-alani/${item.inventoryId}`}
                className="text-stone-900 underline underline-offset-2"
              >
                Detayları Gör
              </Link>
              {advertiserId ? (
                <Link
                  href={`/reklam-alani/${item.inventoryId}?advertiserId=${advertiserId}`}
                  className="font-medium text-amber-800"
                >
                  Talep Oluştur
                </Link>
              ) : (
                <Link href="/advertiser/onboarding" className="text-amber-800">
                  Talep için giriş
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>

      {nextCursor ? (
        <button
          type="button"
          className="rounded border border-stone-300 px-4 py-2 text-sm"
          disabled={loading}
          onClick={() => {
            setCursor(nextCursor)
            void load(true, nextCursor)
          }}
        >
          Daha fazla
        </button>
      ) : null}
      {!loading && items.length === 0 && !error ? (
        <p className="text-sm text-stone-500">Satışa açık reklam alanı bulunamadı.</p>
      ) : null}
      {/* silence unused */}
      {void cursor}
    </div>
  )
}
