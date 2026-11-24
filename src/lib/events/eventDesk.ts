/**
 * EVENT-DESK-1 — Etkinlik Masası (saf, G/Ç yok).
 *
 * - Bugünden sonraki etkinlikler (iptal edilenler hariç), il / tür / görselsiz filtresi istemcide.
 * - Tekrar birleştirme: aynı başlık + il + gün + saat → tek satır (kaynaklar ve mekânlar birleşir);
 *   aynı başlık + il + mekân art arda 3+ gün → «her gün» tek satır.
 * - Şüpheli tarih: bugünden 2 yıldan sonrası (sağlayıcı verisindeki 2034–2036 gibi) listeye girmez, ayrı gösterilir.
 * - Masa kaydı (eventDesk/{eventId}): editörün eklediği kapak, medya, eksik bilgiler, not, tarih düzeltmesi,
 *   gizleme ve oluşturulan haber. Etkinlik belgesine yazılmaz (günlük senkron üzerine yazar).
 */
import type { EventCategory, NaEvent } from '@/types/event'

export const SUSPICIOUS_AFTER_DAYS = 730

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  concert: 'Konser',
  theater: 'Tiyatro',
  festival: 'Festival',
  party: 'Parti',
  exhibition: 'Sergi',
  cinema: 'Sinema',
  other: 'Diğer',
}

/** Etkinlik haberinin kategorisi (il haberi). */
export const EVENT_NEWS_CATEGORY: Record<EventCategory, string> = {
  concert: 'yerel-konser',
  theater: 'yerel-tiyatro',
  festival: 'yerel-festival',
  cinema: 'yerel-sinema',
  exhibition: 'yerel-kultur',
  party: 'yerel-etkinlik',
  other: 'yerel-etkinlik',
}

export type MediaRights = 'press' | 'own' | 'permission' | 'unknown'
export const MEDIA_RIGHTS_LABEL: Record<MediaRights, string> = {
  press: 'Basın görseli (organizatör paylaştı)',
  own: 'Kendi çekimimiz',
  permission: 'Kaynak izni var',
  unknown: 'Bilinmiyor · sosyal paylaşımda kullanılmaz',
}

export type DeskMedia = {
  id: string
  kind: 'image' | 'video'
  /** Yüklenen dosya ya da bağlantı (https). Kütüphane videosunda yok. */
  url: string | null
  /** Video Kütüphanesi kaydı. */
  libraryId: string | null
  title: string | null
  poster: string | null
  source: 'upload' | 'library' | 'link'
  rights: MediaRights
  addedAt: number
  addedBy: string | null
}

export type DeskInfo = {
  endsAt: string | null
  doorsAt: string | null
  price: string | null
  ageLimit: string | null
  organizer: string | null
  venue: string | null
  note: string | null
}

export type DeskRecord = {
  eventId: string
  coverUrl: string | null
  media: DeskMedia[]
  info: DeskInfo
  /** Sağlayıcının yanlış tarihi yerine editörün girdiği başlangıç (ISO). */
  startsAtOverride: string | null
  hidden: boolean
  newsId: string | null
  newsStatus: string | null
  updatedAt: number | null
  updatedBy: string | null
}

export const EMPTY_INFO: DeskInfo = { endsAt: null, doorsAt: null, price: null, ageLimit: null, organizer: null, venue: null, note: null }

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max)
  return s || null
}
const longStr = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\r/g, '').trim().slice(0, max)
  return s || null
}
export function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function parseDeskMedia(raw: unknown): DeskMedia | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const kind = r.kind === 'video' ? 'video' : r.kind === 'image' ? 'image' : null
  if (!kind) return null
  const source = r.source === 'library' ? 'library' : r.source === 'link' ? 'link' : 'upload'
  const url = httpsUrl(r.url)
  const libraryId = typeof r.libraryId === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(r.libraryId) ? r.libraryId : null
  if (source === 'library' ? !libraryId : !url) return null
  const rights: MediaRights = r.rights === 'press' || r.rights === 'own' || r.rights === 'permission' ? r.rights : 'unknown'
  const id = typeof r.id === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(r.id) ? r.id : null
  if (!id) return null
  return {
    id,
    kind,
    url,
    libraryId,
    title: str(r.title, 120),
    poster: httpsUrl(r.poster),
    source,
    rights,
    addedAt: typeof r.addedAt === 'number' ? r.addedAt : 0,
    addedBy: str(r.addedBy, 80),
  }
}

export function parseDeskInfo(raw: unknown): DeskInfo {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    endsAt: str(r.endsAt, 40),
    doorsAt: str(r.doorsAt, 40),
    price: str(r.price, 80),
    ageLimit: str(r.ageLimit, 20),
    organizer: str(r.organizer, 120),
    venue: str(r.venue, 160),
    note: longStr(r.note, 3000),
  }
}

export function parseDeskRecord(eventId: string, raw: unknown): DeskRecord {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const media = (Array.isArray(r.media) ? r.media : []).map(parseDeskMedia).filter((m): m is DeskMedia => !!m).slice(0, 24)
  return {
    eventId,
    coverUrl: httpsUrl(r.coverUrl),
    media,
    info: parseDeskInfo(r.info),
    startsAtOverride: isoDate(r.startsAtOverride),
    hidden: r.hidden === true,
    newsId: typeof r.newsId === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(r.newsId) ? r.newsId : null,
    newsStatus: str(r.newsStatus, 20),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null,
    updatedBy: str(r.updatedBy, 80),
  }
}

/** Bugünün başı (Europe/Istanbul, UTC+3, yaz saati yok). */
export function startOfTodayIstanbul(now: number): number {
  const off = 3 * 3600_000
  const d = new Date(now + off)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - off
}

export function dayKeyIstanbul(iso: string): string {
  const t = new Date(iso).getTime() + 3 * 3600_000
  return new Date(t).toISOString().slice(0, 10)
}

/** Karşılaştırma anahtarı: büyük/küçük harf, I/ı/İ ve aksan farkı yok sayılır («UZI» = «Uzi»). */
export function normTitle(t: string): string {
  return t
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type DeskItem = {
  /** Birincil etkinlik kimliği (masa kaydının anahtarı). */
  id: string
  ids: string[]
  title: string
  category: EventCategory
  categoryLabel: string
  city: string
  citySlug: string
  venue: string
  venues: string[]
  startsAt: string
  endsAt: string | null
  /** Aynı başlık, il ve saatte farklı mekânda başka kayıt var (kontrol edilmeli). */
  possibleDuplicate: boolean
  /** «her gün» birleştirmesi */
  daily: { from: string; to: string; days: number } | null
  sources: string[]
  coverUrl: string | null
  description: string
  ticketUrl: string | null
  organizer: string | null
  desk: DeskRecord
  hasImage: boolean
  completeness: { percent: number; missing: string[] }
}

export type SuspectItem = { id: string; title: string; city: string; source: string; startsAt: string }

function providerName(e: NaEvent): string {
  if (e.provider) return e.provider
  const s = e.source || 'firestore'
  if (['firestore', 'init-script', 'admin'].includes(s)) return 'NaHaber'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function completenessOf(item: Pick<DeskItem, 'venue' | 'description' | 'organizer' | 'endsAt'>, desk: DeskRecord, hasImage: boolean): { percent: number; missing: string[] } {
  const checks: Array<[string, boolean]> = [
    ['Görsel', hasImage],
    ['Mekân', !!(desk.info.venue || item.venue)],
    ['Bitiş saati', !!(desk.info.endsAt || item.endsAt)],
    ['Kapı açılış', !!desk.info.doorsAt],
    ['Bilet fiyatı', !!desk.info.price],
    ['Yaş sınırı', !!desk.info.ageLimit],
    ['Organizatör', !!(desk.info.organizer || item.organizer)],
    ['Etkinlik hakkında', !!(desk.info.note || (item.description && item.description.length >= 40))],
  ]
  const ok = checks.filter(([, v]) => v).length
  return { percent: Math.round((ok / checks.length) * 100), missing: checks.filter(([, v]) => !v).map(([k]) => k) }
}

/**
 * Masa listesi: gelecek, iptal edilmemiş, gizlenmemiş etkinlikler; tekrarlar birleşik; tarihe göre.
 */
export function buildDesk(
  events: NaEvent[],
  desks: Map<string, DeskRecord>,
  now: number
): { items: DeskItem[]; suspects: SuspectItem[] } {
  const from = startOfTodayIstanbul(now)
  const limit = now + SUSPICIOUS_AFTER_DAYS * 86400_000
  const suspects: SuspectItem[] = []
  type Acc = DeskItem & { _day: string; _key: string }
  const byDay = new Map<string, Acc>()

  for (const e of events) {
    if (e.status === 'cancelled' || e.status === 'draft') continue
    const desk = desks.get(e.id) ?? parseDeskRecord(e.id, null)
    if (desk.hidden) continue
    const startsAt = desk.startsAtOverride ?? e.startsAt
    const t = new Date(startsAt).getTime()
    if (Number.isNaN(t)) continue
    if (t < from) continue
    if (t > limit) {
      suspects.push({ id: e.id, title: e.title, city: e.city, source: providerName(e), startsAt })
      continue
    }
    const nt = normTitle(e.title)
    const day = dayKeyIstanbul(startsAt)
    // Aynı gün farklı saatteki gösteriler ayrı kalır; aynı saat + aynı mekândaki kopyalar (farklı sağlayıcı) birleşir.
    // Mekân farklıysa birleştirilmez, «olası tekrar» işaretlenir (gerçek iki gösteri gizlenmesin).
    const key = `${nt}|${e.citySlug}|${day}|${new Date(t).toISOString().slice(11, 16)}|${normTitle(e.venue || '')}`
    const src = providerName(e)
    const prev = byDay.get(key)
    if (prev) {
      prev.ids.push(e.id)
      if (!prev.sources.includes(src)) prev.sources.push(src)
      if (e.venue && !prev.venues.some((v) => normTitle(v) === normTitle(e.venue))) prev.venues.push(e.venue)
      if (!prev.coverUrl && e.coverImageUrl) prev.coverUrl = e.coverImageUrl
      if (!prev.ticketUrl && e.ticketUrl) prev.ticketUrl = e.ticketUrl
      if ((e.description?.length ?? 0) > prev.description.length) prev.description = e.description
      if (startsAt < prev.startsAt) prev.startsAt = startsAt
      continue
    }
    byDay.set(key, {
      _day: day,
      _key: `${nt}|${e.citySlug}`,
      id: e.id,
      ids: [e.id],
      title: e.title,
      category: e.category,
      categoryLabel: EVENT_CATEGORY_LABEL[e.category] ?? 'Diğer',
      city: e.city,
      citySlug: e.citySlug,
      venue: e.venue,
      venues: e.venue ? [e.venue] : [],
      startsAt,
      endsAt: e.endsAt ?? null,
      daily: null,
      possibleDuplicate: false,
      sources: [src],
      coverUrl: e.coverImageUrl ?? null,
      description: e.description ?? '',
      ticketUrl: e.ticketUrl ?? null,
      organizer: e.organizer ?? null,
      desk,
      hasImage: false,
      completeness: { percent: 0, missing: [] },
    })
  }

  // Art arda günlerde tekrar eden aynı etkinlik (aynı başlık + il + mekân) → «her gün»
  const runs = new Map<string, Acc[]>()
  for (const it of byDay.values()) {
    const k = `${it._key}|${normTitle(it.venues[0] ?? '')}`
    const list = runs.get(k) ?? []
    list.push(it)
    runs.set(k, list)
  }
  const out: DeskItem[] = []
  for (const list of runs.values()) {
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    let i = 0
    while (i < list.length) {
      let j = i
      while (j + 1 < list.length && dayDiff(list[j]!._day, list[j + 1]!._day) === 1) j++
      const n = j - i + 1
      const first = list[i]!
      if (n >= 3) {
        for (let k = i + 1; k <= j; k++) {
          const o = list[k]!
          first.ids.push(...o.ids)
          for (const s of o.sources) if (!first.sources.includes(s)) first.sources.push(s)
          if (!first.coverUrl && o.coverUrl) first.coverUrl = o.coverUrl
        }
        first.daily = { from: list[i]!.startsAt, to: list[j]!.startsAt, days: n }
        out.push(first)
      } else {
        for (let k = i; k <= j; k++) out.push(list[k]!)
      }
      i = j + 1
    }
  }

  const sameSlot = new Map<string, number>()
  for (const it of out) {
    const k = `${normTitle(it.title)}|${it.citySlug}|${it.startsAt.slice(0, 16)}`
    sameSlot.set(k, (sameSlot.get(k) ?? 0) + 1)
  }
  for (const it of out) {
    it.possibleDuplicate = (sameSlot.get(`${normTitle(it.title)}|${it.citySlug}|${it.startsAt.slice(0, 16)}`) ?? 0) > 1
    const cover = it.desk.coverUrl ?? it.coverUrl ?? it.desk.media.find((m) => m.kind === 'image')?.url ?? null
    it.coverUrl = cover
    it.hasImage = !!cover
    it.completeness = completenessOf(it, it.desk, it.hasImage)
    delete (it as Partial<Acc>)._day
    delete (it as Partial<Acc>)._key
  }
  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title, 'tr'))
  suspects.sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  return { items: out, suspects }
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400_000)
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

/** «11 Aralık Cuma» (+ yıl, bu yıl değilse) ve «21.30». */
export function trDateParts(iso: string, now: number): { date: string; time: string; day: string; mon: string } {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000)
  const y = new Date(now + 3 * 3600_000).getUTCFullYear()
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear() !== y ? ` ${d.getUTCFullYear()}` : ''} ${DAYS[d.getUTCDay()]}`
  const time = `${String(d.getUTCHours()).padStart(2, '0')}.${String(d.getUTCMinutes()).padStart(2, '0')}`
  return { date, time, day: String(d.getUTCDate()).padStart(2, '0'), mon: MONTHS[d.getUTCMonth()]!.slice(0, 3).toLocaleUpperCase('tr-TR') }
}

/** Sayının okunuşuna göre bulunma eki: 1'de, 3'te, 6'da, 10'da, 20'de, 30'da, 40'ta, 0'da. */
function numLocative(n: number): string {
  const units: Record<number, string> = { 1: "'de", 2: "'de", 3: "'te", 4: "'te", 5: "'te", 6: "'da", 7: "'de", 8: "'de", 9: "'da" }
  const tens: Record<number, string> = { 0: "'da", 10: "'da", 20: "'de", 30: "'da", 40: "'ta", 50: "'de" }
  const u = n % 10
  return u ? units[u]! : tens[n - u] ?? "'de"
}

/** Saat + bulunma eki, okunuşa göre: 21.30'da, 21.45'te, 21.00'de (yirmi birde), 10.00'da, 20.00'de. */
export function timeLocative(t: string): string {
  const [hh, mm] = t.split('.').map(Number) as [number, number]
  return t + numLocative(mm ? mm : hh)
}

export type EventNewsDraft = {
  title: string
  spot: string
  summary: string
  content: string
  seoTitle: string
  seoDescription: string
  tags: string[]
  socialCaption: string
}

/** Kaynak metin (AI yalnızca bunu kullanır; unvan denetimi de buna göre). */
export function eventSourceText(it: DeskItem, now: number): string {
  const p = trDateParts(it.startsAt, now)
  const info = it.desk.info
  const lines = [
    `Etkinlik: ${it.title}`,
    `Tür: ${it.categoryLabel}`,
    `İl: ${it.city}`,
    `Mekân: ${info.venue || it.venues.join(' / ') || it.venue}`,
    it.daily ? `Tarih: ${p.date} itibarıyla ${it.daily.days} gün boyunca her gün, saat ${p.time}` : `Tarih: ${p.date}, saat ${p.time}`,
    info.endsAt || it.endsAt ? `Bitiş: ${info.endsAt || trDateParts(it.endsAt!, now).time}` : '',
    info.doorsAt ? `Kapı açılış: ${info.doorsAt}` : '',
    info.price ? `Bilet fiyatı: ${info.price}` : '',
    info.ageLimit ? `Yaş sınırı: ${info.ageLimit}` : '',
    info.organizer || it.organizer ? `Organizatör: ${info.organizer || it.organizer}` : '',
    it.sources.filter((s) => s !== 'NaHaber').length ? `Bilet satışı: ${it.sources.filter((s) => s !== 'NaHaber').join(', ')}` : '',
    it.description ? `Kaynak açıklaması: ${it.description.slice(0, 2500)}` : '',
    info.note ? `Editör notu: ${info.note}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export const EVENT_NEWS_SYSTEM = `Sen NaHaber'in etkinlik editörüsün. Verilen etkinlik bilgisinden kısa, davetkâr ama olgusal bir Türkçe etkinlik haberi yazarsın.
KURALLAR:
- Yalnızca verilen bilgileri kullan. Kaynakta olmayan sanatçı geçmişi, albüm, ödül, program, fiyat, konuk, unvan ya da rakam EKLEME.
- Kişilerin unvanını, grubunu ve kurumunu yalnızca kaynaktan al; kendi bilgin eski olabilir.
- Başlık: etkinlik adı + il + tarih; 6-12 kelime, en fazla 85 karakter; ŞOK/SKANDAL/FLAŞ yok.
- Spot: kim/ne, nerede, ne zaman (gün ve saat), bilet bilgisi varsa nereden; 1-2 cümle.
- content: markdown; "## Etkinlik Bilgileri" (yer, tarih, saat, varsa kapı açılış/fiyat/yaş sınırı/organizatör madde madde) ve bilgi varsa "## Etkinlik Hakkında" bölümü. Kaynak açıklaması kısaysa kısa yaz; doldurma yapma. 120-350 kelime.
- seoTitle 50-60 karakter, seoDescription 140-155 karakter, tags 4-6 küçük harf (il adı dahil).
- socialCaption: 2-3 cümle, başlığı tekrar etmeden yer-saat ve bilet bilgisi.
- Yalnızca JSON döndür: {"title":"","spot":"","summary":"","content":"","seoTitle":"","seoDescription":"","tags":[],"socialCaption":""}`

export function parseEventNews(raw: string): EventNewsDraft | null {
  try {
    let s = raw.trim()
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) s = fence[1]!.trim()
    if (!s.startsWith('{')) {
      const m = s.match(/\{[\s\S]*\}/)
      if (m) s = m[0]
    }
    const j = JSON.parse(s) as Record<string, unknown>
    const t = (k: string, max: number) => (typeof j[k] === 'string' ? (j[k] as string).trim().slice(0, max) : '')
    const draft: EventNewsDraft = {
      title: t('title', 120),
      spot: t('spot', 600),
      summary: t('summary', 280),
      content: t('content', 8000).replace(/<[^>]+>/g, ''),
      seoTitle: t('seoTitle', 70),
      seoDescription: t('seoDescription', 170),
      tags: Array.isArray(j.tags) ? j.tags.map(String).map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 8) : [],
      socialCaption: t('socialCaption', 700),
    }
    if (draft.title.length < 10 || draft.content.length < 80) return null
    if (!draft.summary) draft.summary = draft.spot.slice(0, 280)
    return draft
  } catch {
    return null
  }
}

/** Seslendirme metni — AI'sız, yalnızca etkinlik alanlarından (≤ 200 karakter: önizleme sınırı). */
export function eventVoiceScript(it: DeskItem, now: number): string {
  const p = trDateParts(it.startsAt, now)
  const venue = it.desk.info.venue || it.venues[0] || it.venue
  const when = it.daily ? `${p.date.replace(/ \S+$/, '')} itibarıyla her gün` : p.date
  const sellers = it.sources.filter((s) => s !== 'NaHaber')
  const parts = [
    `NaHaber ${it.city} etkinlik rehberi.`,
    `${it.title}, ${when}, saat ${timeLocative(p.time)}, ${venue}.`,
    sellers.length ? `Biletler ${sellers[0]} üzerinden satışta.` : '',
  ].filter(Boolean)
  let s = parts.join(' ')
  if (s.length > 200) s = parts.slice(0, 2).join(' ')
  return s.slice(0, 200)
}
