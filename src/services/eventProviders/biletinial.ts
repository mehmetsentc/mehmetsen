import type { EventProvider } from './types'
import { BROWSER_UA, isDisabledByEnv, mapWithConcurrency, normalizeEvent, providerLog, readEnv, toNumber } from './shared'
import { provinceName, provinceSlug } from './provinces'
import type { NaEvent } from '@/types/event'

/**
 * Biletinial — LIVE, ulusal (tek çağrıda 81 il).
 *
 * Biletinial'in kendi liste sayfalarının kullandığı herkese açık JSON uç noktası:
 *   GET /tr-tr/List/GetMoreItems?region=tr-tr&cityId=<id>&cityUrl=<url>&organizerUrl=<tür>&page=<0..>
 * → { hasMore, items: [{ id, name, seoUrl, imageUrl, cityName, saloonName, minTicketAmount,
 *      categoryName, seances: ["2026-12-02T20:30:00", …], organizerUrl }] }
 * Sayfa başına 50 kayıt. İl listesi (id ↔ url) liste sayfasındaki `data-id/data-label/data-url`
 * öznitelikleriyle her çalıştırmada okunur. robots.txt: `User-agent: * Allow: /` (yalnız giriş ve
 * /kino/ yasak — kullanılmıyor).
 *
 * Devlet Tiyatroları, şehir tiyatroları, senfoni/opera ve turneler burada; her seans ayrı etkinlik
 * olur (öğe başına en çok BILETINIAL_MAX_SEANCES, önümüzdeki 75 gün).
 * Kapatma: BILETINIAL_DISABLED=true.
 */

const BASE = 'https://biletinial.com'
const IMG_BASE = 'https://b6s54eznn8xq.merlincdn.net'
const ORGANIZERS: Array<[string, string]> = [
  ['muzik', 'Konser'],
  ['tiyatro', 'Tiyatro'],
  ['opera-bale', 'Opera Bale'],
  ['etkinlik', 'Etkinlik'],
]
const MAX_PAGES = 12
const HORIZON_DAYS = 75
const BUDGET_MS = 130_000
const CONCURRENCY = 4

export interface BiletinialItem {
  id: number
  name: string
  seoUrl: string
  imageUrl?: string | null
  cityName?: string | null
  saloonName?: string | null
  minTicketAmount?: number | null
  isFree?: boolean
  categoryName?: string | null
  seances?: string[] | null
  organizerUrl?: string | null
}

type City = { id: string; label: string; url: string; slug: string }

async function getText(url: string, accept = 'text/html'): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: accept, 'Accept-Language': 'tr-TR,tr;q=0.9' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()

/** Liste sayfasındaki il seçicisinden il kimlikleri. İstanbul için yalnız «Tümü». */
export function parseCities(html: string): City[] {
  const out = new Map<string, City>()
  for (const m of html.matchAll(/data-id="(\d+)"\s+data-label="([^"]*)"\s+data-url="([a-z0-9-]+)"/g)) {
    const [, id, rawLabel, url] = m
    if (url === 'istanbul-avrupa' || url === 'istanbul-anadolu') continue
    const label = decode(rawLabel!)
    const slug = provinceSlug(url) ?? provinceSlug(label)
    if (!slug || out.has(slug)) continue
    out.set(slug, { id: id!, label, url: url!, slug })
  }
  return [...out.values()]
}

/**
 * Tür, sitenin bölümünden (müzik → konser, tiyatro / opera-bale → sahne); «etkinlik» bölümünde
 * alt tür adından. Başlıktaki «gece», «show» gibi sözcükler türü bozmasın diye başlık kullanılmaz.
 */
export function biletinialCategory(org: string, item: Pick<BiletinialItem, 'categoryName'>): string {
  const sub = (item.categoryName ?? '').toLocaleLowerCase('tr-TR')
  if (sub.includes('festival')) return 'festival'
  if (org === 'muzik') return 'konser'
  if (org === 'tiyatro' || org === 'opera-bale') return 'tiyatro'
  return sub || 'diğer'
}

/** Bir öğeyi seans başına etkinliğe çevirir (yalnız gelecek ve ufuk içindeki seanslar). */
export function biletinialEvents(item: BiletinialItem, organizer: string, _label: string, citySlug: string, now: number, maxSeances: number): NaEvent[] {
  const until = now + HORIZON_DAYS * 86_400_000
  const seances = (item.seances ?? [])
    .map((s) => ({ s, t: Date.parse(`${s}${/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : '+03:00'}`) }))
    .filter((x) => Number.isFinite(x.t) && x.t >= now - 3_600_000 && x.t <= until)
    .sort((a, b) => a.t - b.t)
    .slice(0, maxSeances)
  const org = item.organizerUrl || organizer
  const price = item.isFree ? 'Ücretsiz' : toNumber(item.minTicketAmount) ? `${Math.round(Number(item.minTicketAmount))} TL'den başlayan` : ''
  const out: NaEvent[] = []
  for (const { t } of seances) {
    const e = normalizeEvent({
      providerId: 'biletinial',
      providerLabel: 'Biletinial',
      externalId: `${item.id}@${new Date(t).toISOString()}`,
      title: item.name,
      description: [item.categoryName, item.saloonName, price ? `Bilet: ${price}` : ''].filter(Boolean).join(' · '),
      category: biletinialCategory(org, item),
      city: provinceName(citySlug),
      citySlug,
      venue: item.saloonName ?? null,
      startsAt: new Date(t).toISOString(),
      coverImageUrl: item.imageUrl ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${IMG_BASE}${item.imageUrl}`) : null,
      ticketUrl: `${BASE}/tr-tr/${org}/${item.seoUrl}`,
    })
    if (e) out.push(e)
  }
  return out
}

export const biletinialProvider: EventProvider = {
  id: 'biletinial',
  label: 'Biletinial',
  national: true,
  // bir il/tür sayfası hata verirse o ilin etkinlikleri yanlışlıkla «iptal» sayılmasın
  partialFeed: true,

  isEnabled() {
    return !isDisabledByEnv('BILETINIAL_DISABLED')
  },

  async fetchEvents(): Promise<NaEvent[]> {
    const started = Date.now()
    const now = Date.now()
    const maxSeances = toNumber(readEnv('BILETINIAL_MAX_SEANCES')) ?? 6
    try {
      const cities = parseCities(await getText(`${BASE}/tr-tr/tiyatro/istanbul`))
      if (cities.length < 20) {
        providerLog('biletinial', `il listesi okunamadı (${cities.length})`)
        return []
      }
      const jobs = cities.flatMap((c) => ORGANIZERS.map(([org, label]) => ({ c, org, label })))
      const results = await mapWithConcurrency(jobs, CONCURRENCY, async ({ c, org, label }) => {
        const events: NaEvent[] = []
        for (let page = 0; page < MAX_PAGES; page++) {
          if (Date.now() - started > BUDGET_MS) break
          const q = new URLSearchParams({ region: 'tr-tr', cityId: c.id, cityUrl: c.url, order: '0', isKids: 'false', isCampaign: 'false', isForeign: 'false', organizerUrl: org, page: String(page) })
          try {
            const data = JSON.parse(await getText(`${BASE}/tr-tr/List/GetMoreItems?${q}`, 'application/json')) as { hasMore?: boolean; items?: BiletinialItem[] }
            for (const it of data.items ?? []) {
              // «tüm illerde gösterilen» (showOnAllCities) öğe başka ilin salonundaysa atla
              if (it.cityName && provinceSlug(it.cityName) && provinceSlug(it.cityName) !== c.slug) continue
              events.push(...biletinialEvents(it, org, label, c.slug, now, maxSeances))
            }
            if (!data.hasMore || !data.items?.length) break
          } catch {
            break
          }
        }
        return events
      })
      const out = results.flat()
      providerLog('biletinial', `${out.length} seans · ${cities.length} il · ${Math.round((Date.now() - started) / 1000)} sn`)
      return out
    } catch (error) {
      providerLog('biletinial', `başarısız: ${error instanceof Error ? error.message : 'hata'}`)
      return []
    }
  },
}
