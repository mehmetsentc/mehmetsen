import type { EventProvider } from './types'
import { BROWSER_UA, findEventNode, extractJsonLd, isDisabledByEnv, mapWithConcurrency, normalizeEvent, providerLog, readEnv, stripHtml, toNumber } from './shared'
import { provinceFromText, provinceName, provinceSlug } from './provinces'
import type { NaEvent } from '@/types/event'

/**
 * etkinlik.io — LIVE, ulusal, ARTIMLI (~7.000 yaklaşan etkinlik, ~80 il).
 *
 * robots.txt: `User-Agent: * Allow: /` (yalnız bilet yönlendirme bağlantıları yasak — kullanılmıyor).
 * Kaynağın yayımladığı site haritası (`/sitemap/etkinlikler`) bütün etkinlik sayfalarını listeler;
 * her sayfada schema.org `Event` (tarih, mekân, adres: il = addressRegion, görsel) ve
 * `BreadcrumbList` (il › tür › alt tür) var.
 *
 * Her çalıştırmada yalnız DAHA ÖNCE İŞLENMEMİŞ etkinlik sayfaları okunur (en yeniler önce,
 * ETKINLIKIO_MAX_NEW, varsayılan 500, süre sınırı 110 sn). İşlenenler tek bir Firestore belgesinde
 * tutulur (`meta/eventSyncEtkinlikIo`: id → başlangıç zamanı) → 1 okuma + 1 yazma / gün.
 * İlk günlerde katalog kademeli dolar (≈ 2 haftada tamamı). Artımlı olduğu için «akışta yok → iptal»
 * işaretlemesi yapılmaz (partialFeed).
 *
 * Resmî API (X-Etkinlik-Token) de var; ETKINLIKIO_TOKEN tanımlanırsa ileride ona geçilebilir.
 * Kapatma: ETKINLIKIO_DISABLED=true.
 */

const BASE = 'https://etkinlik.io'
const STATE_DOC = 'meta/eventSyncEtkinlikIo'
const BUDGET_MS = 100_000
const CONCURRENCY = 5
const RETRY_AFTER_MS = 7 * 86_400_000

type Seen = Record<string, number>

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xml', 'Accept-Language': 'tr-TR,tr;q=0.9' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/** site haritası → [{ id, url }] (düz metin ya da XML) */
export function parseSitemap(text: string): Array<{ id: string; url: string }> {
  const out = new Map<string, string>()
  for (const m of text.matchAll(/https:\/\/etkinlik\.io\/etkinlik\/(\d+)\/[a-z0-9-]+/g)) out.set(m[1]!, m[0])
  return [...out.entries()].map(([id, url]) => ({ id, url }))
}

/** Etkinlik sayfası → NaEvent (il addressRegion'dan; tür breadcrumb'dan). */
export function parseEtkinlikIoPage(html: string, url: string, id: string): NaEvent | null {
  const node = findEventNode(html)
  if (!node) return null
  const loc = node.location as { name?: string; address?: { streetAddress?: string; addressLocality?: string; addressRegion?: string } } | undefined
  const addr = loc?.address
  const crumbs = extractJsonLd(html).find((n) => n['@type'] === 'BreadcrumbList') as { itemListElement?: Array<{ name?: string }> } | undefined
  const names = (crumbs?.itemListElement ?? []).map((x) => x.name ?? '')
  const citySlug = provinceSlug(addr?.addressRegion) ?? provinceSlug(names[1]) ?? provinceFromText(addr?.streetAddress)
  if (!citySlug) return null
  const image = Array.isArray(node.image) ? (node.image[0] as string) : typeof node.image === 'string' ? node.image : null
  return normalizeEvent({
    providerId: 'etkinlikio',
    providerLabel: 'etkinlik.io',
    externalId: id,
    title: typeof node.name === 'string' ? node.name : '',
    description: stripHtml(typeof node.description === 'string' ? node.description : ''),
    category: `${names.slice(2, -1).join(' ')} ${typeof node.name === 'string' ? node.name : ''}`,
    city: provinceName(citySlug),
    citySlug,
    venue: loc?.name ?? null,
    address: [addr?.streetAddress, addr?.addressLocality].filter(Boolean).join(', ') || null,
    startsAt: node.startDate,
    endsAt: node.endDate ?? null,
    coverImageUrl: image,
    ticketUrl: url,
  })
}

async function loadSeen(): Promise<Seen> {
  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const snap = await getAdminFirestore().doc(STATE_DOC).get()
    return ((snap.data()?.seen as Seen | undefined) ?? {})
  } catch {
    return {}
  }
}
async function saveSeen(seen: Seen): Promise<void> {
  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    await getAdminFirestore().doc(STATE_DOC).set({ seen, updatedAt: new Date().toISOString(), count: Object.keys(seen).length })
  } catch (error) {
    providerLog('etkinlikio', `durum yazılamadı: ${error instanceof Error ? error.message : 'hata'}`)
  }
}

/** Bu çalıştırmada okunacak sayfalar: hiç işlenmemiş ya da yeniden deneme zamanı gelmiş, en yeniler önce. */
export function pickNew(entries: Array<{ id: string; url: string }>, seen: Seen, now: number, max: number) {
  return entries
    .filter((e) => {
      const v = seen[e.id]
      return v === undefined || (v < 0 && -v <= now)
    })
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, max)
}

export const etkinlikIoProvider: EventProvider = {
  id: 'etkinlikio',
  label: 'etkinlik.io',
  national: true,
  partialFeed: true,

  isEnabled() {
    return !isDisabledByEnv('ETKINLIKIO_DISABLED')
  },

  async fetchEvents(): Promise<NaEvent[]> {
    const started = Date.now()
    const max = toNumber(readEnv('ETKINLIKIO_MAX_NEW')) ?? 500
    try {
      const entries = parseSitemap(await getText(`${BASE}/sitemap/etkinlikler`))
      if (entries.length < 50) {
        providerLog('etkinlikio', `site haritası beklenmedik (${entries.length})`)
        return []
      }
      const seen = await loadSeen()
      const live = new Set(entries.map((e) => e.id))
      for (const k of Object.keys(seen)) if (!live.has(k)) delete seen[k]
      const todo = pickNew(entries, seen, started, max)
      const results = await mapWithConcurrency(todo, CONCURRENCY, async ({ id, url }) => {
        if (Date.now() - started > BUDGET_MS) return null
        try {
          const ev = parseEtkinlikIoPage(await getText(url), url, id)
          seen[id] = ev ? Date.parse(ev.startsAt) || 1 : -(Date.now() + RETRY_AFTER_MS)
          return ev
        } catch {
          seen[id] = -(Date.now() + RETRY_AFTER_MS / 7)
          return null
        }
      })
      await saveSeen(seen)
      const out = results.filter((e): e is NaEvent => !!e)
      providerLog('etkinlikio', `${out.length}/${todo.length} yeni sayfa · harita ${entries.length} · ${Math.round((Date.now() - started) / 1000)} sn`)
      return out
    } catch (error) {
      providerLog('etkinlikio', `başarısız: ${error instanceof Error ? error.message : 'hata'}`)
      return []
    }
  },
}
