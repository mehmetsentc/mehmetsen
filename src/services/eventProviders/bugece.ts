import type { EventProvider } from './types'
import { BROWSER_UA, isDisabledByEnv, normalizeEvent, providerLog } from './shared'
import { provinceName, provinceSlug } from './provinces'
import type { NaEvent } from '@/types/event'

/**
 * BUGECE — LIVE, ulusal, RESMÎ AÇIK API.
 *
 * Bugece «BUGECE public API» yayımlıyor (https://bugece.co/api/openapi.json; robots.txt
 * /api/feeds'e açıkça izin veriyor). `GET /api/feeds/{events|festivals}/products` → yaklaşan
 * etkinlikler (ACP ürün biçimi): başlık, bağlantı, görsel, fiyat (kuruş), tür etiketleri ve
 * `description.plain = "Başlık · Mekân · Şehir · ISO tarih · türler"`.
 * Konser, festival, kulüp/gece hayatı. Tek istek (+ festivaller). Kapatma: BUGECE_DISABLED=true.
 */

const BASE = 'https://bugece.co'
const FEEDS = ['events', 'festivals'] as const

export interface BugeceProduct {
  id: string
  title: string
  description?: { plain?: string }
  url?: string
  media?: Array<{ type?: string; url?: string }>
  variants?: Array<{ price?: { amount?: number; currency?: string }; categories?: Array<{ value?: string }>; seller?: { name?: string } }>
}

/** «Başlık · Mekân · Şehir · 2026-11-27T18:00:00.000Z · Tür, Tür» */
export function parseBugecePlain(plain: string): { venue: string; city: string; startsAt: string | null; genres: string } {
  const parts = plain.split(' · ').map((x) => x.trim())
  const iso = parts.findIndex((x) => /^\d{4}-\d{2}-\d{2}T/.test(x))
  if (iso < 2) return { venue: '', city: '', startsAt: null, genres: '' }
  return { venue: parts[iso - 2] ?? '', city: parts[iso - 1] ?? '', startsAt: parts[iso]!, genres: parts.slice(iso + 1).join(', ') }
}

export function bugeceEvent(p: BugeceProduct, feed: string): NaEvent | null {
  const info = parseBugecePlain(p.description?.plain ?? '')
  const citySlug = provinceSlug(info.city)
  if (!citySlug || !info.startsAt) return null
  const v = p.variants?.[0]
  const genres = info.genres || (v?.categories ?? []).map((c) => c.value).filter(Boolean).join(', ')
  const amount = v?.price?.amount
  const price = typeof amount === 'number' && amount > 0 ? `${Math.round(amount / 100)} TL'den başlayan` : ''
  return normalizeEvent({
    providerId: 'bugece',
    providerLabel: 'Bugece',
    externalId: p.id,
    title: p.title,
    description: [genres, price ? `Bilet: ${price}` : ''].filter(Boolean).join(' · '),
    category: `${feed === 'festivals' ? 'festival' : ''} ${genres} ${p.title} müzik`,
    city: provinceName(citySlug),
    citySlug,
    venue: info.venue || v?.seller?.name || null,
    startsAt: info.startsAt,
    coverImageUrl: p.media?.find((m) => m.type === 'image' && m.url)?.url ?? null,
    ticketUrl: p.url ?? null,
  })
}

export const bugeceProvider: EventProvider = {
  id: 'bugece',
  label: 'Bugece',
  national: true,
  partialFeed: false,

  isEnabled() {
    return !isDisabledByEnv('BUGECE_DISABLED')
  },

  async fetchEvents(): Promise<NaEvent[]> {
    const out = new Map<string, NaEvent>()
    for (const feed of FEEDS) {
      try {
        const res = await fetch(`${BASE}/api/feeds/${feed}/products`, {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(30_000),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { products?: BugeceProduct[] }
        for (const p of data.products ?? []) {
          const e = bugeceEvent(p, feed)
          if (e && !out.has(e.id)) out.set(e.id, e)
        }
      } catch (error) {
        providerLog('bugece', `${feed} alınamadı: ${error instanceof Error ? error.message : 'hata'}`)
        // ana akış alınamadıysa hiçbir şey döndürme (iptal işaretlemesi yanlış çalışmasın)
        if (feed === 'events') return []
      }
    }
    providerLog('bugece', `${out.size} etkinlik`)
    return [...out.values()]
  },
}
