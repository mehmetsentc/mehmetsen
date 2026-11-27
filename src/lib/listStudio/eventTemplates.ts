/**
 * ETKİNLİK STÜDYOSU — hazır şablonlar (saf modül).
 * Kart şablonları tek kare / kaydırmalı görsel üretir; video şablonları Reels / Hikâye üretir.
 * Tasarım örnekleri: «Etkinlik Stüdyosu — Şablon Örnekleri» tuvali (Görev 66).
 */

export const CARD_TEMPLATES = ['k1-buyukisim', 'k2-haftasonu', 'k3-festival', 'k4-bilet', 'k5-takvim', 'k6-izgara', 'k7-risograf', 'k8-kolaj', 'k9-harita', 'k10-saatler', 'k11-set'] as const
export const VIDEO_TEMPLATES = ['v1-turne', 'v2-tektarih', 'v3-hafta', 'v4-minimal', 'v5-gerisayim', 'v6-kinetik', 'v7-lineup', 'v8-bolunmus', 'v9-ozet', 'v10-altyazi', 'v11-takvim'] as const
export const EVENT_TEMPLATES = [...CARD_TEMPLATES, ...VIDEO_TEMPLATES] as const
export type CardTemplate = (typeof CARD_TEMPLATES)[number]
export type VideoTemplate = (typeof VIDEO_TEMPLATES)[number]
export type EventTemplate = (typeof EVENT_TEMPLATES)[number]

/** kart çizimi: her etkinliğe bir kare mi (tekli), bütün etkinlikler tek karede mi (çoklu) */
export type CardScope = 'each' | 'all' | 'set'
/** video: giriş kartı düzeni, etkinlik bölümü düzeni */
export type IntroLayout = 'default' | 'turne' | 'hafta' | 'gerisayim' | 'lineup' | 'bolunmus' | 'ozet' | 'takvim'
export type SectionLayout = 'kart' | 'tektarih' | 'minimal' | 'kinetik' | 'altyazi'

export interface TemplateInfo {
  label: string
  desc: string
  kind: 'kart' | 'video'
  /** önerilen etkinlik sayısı (UI ipucu) */
  fits: string
  accent: string
  bg: string
  text: string
  scope?: CardScope
  intro?: IntroLayout
  section?: SectionLayout
  /** çoklu kartta en çok kaç etkinlik sığar */
  max?: number
}

export const TEMPLATE_INFO: Record<EventTemplate, TemplateInfo> = {
  'k1-buyukisim': { label: 'Büyük isim afişi', desc: 'Açık zemin, dev isim, dikey tarih kutusu', kind: 'kart', fits: '1 etkinlik (çok seçilirse her biri bir kare)', accent: '#e11d48', bg: '#f5f5f2', text: '#0a0a0a', scope: 'each' },
  'k2-haftasonu': { label: 'Hafta sonu programı', desc: 'Hesap başlığı, gün başlıkları, görselli satırlar', kind: 'kart', fits: '2–5 etkinlik', accent: '#ffffff', bg: '#6b0f1a', text: '#ffffff', scope: 'all', max: 5 },
  'k3-festival': { label: 'Festival line-up', desc: 'Renkli afiş, gün gün sanatçılar', kind: 'kart', fits: '3–9 etkinlik', accent: '#facc15', bg: '#1d4ed8', text: '#ffffff', scope: 'all', max: 9 },
  'k4-bilet': { label: 'Bilet koçanı', desc: 'Delikli bilet, tarih · kapı · mekân · şehir', kind: 'kart', fits: '1 etkinlik', accent: '#e11d48', bg: '#1f3a5f', text: '#111111', scope: 'each' },
  'k5-takvim': { label: 'Ay takvimi', desc: 'Ayın günleri, etkinlik günleri vurgulu', kind: 'kart', fits: '3–15 etkinlik (aynı ay)', accent: '#f59e0b', bg: '#111827', text: '#f4f4f5', scope: 'all', max: 31 },
  'k6-izgara': { label: 'İsviçre ızgara', desc: 'Sade tipografi, çizgiler, tek renk daire', kind: 'kart', fits: '1 etkinlik', accent: '#e4572e', bg: '#f2efe8', text: '#111111', scope: 'each' },
  'k7-risograf': { label: 'Risograf / yarım ton', desc: 'Noktalı baskı dokusu, iki renk', kind: 'kart', fits: '1 etkinlik', accent: '#ff48b0', bg: '#f7f0dd', text: '#1b1b3a', scope: 'each' },
  'k8-kolaj': { label: 'Kolaj / polaroid', desc: 'Bantlı fotoğraflar, el yazısı notlar', kind: 'kart', fits: '2–3 etkinlik', accent: '#e11d48', bg: '#efe6d8', text: '#1c1917', scope: 'all', max: 3 },
  'k9-harita': { label: 'Mekân haritası', desc: '«Bu akşam nerede ne var», iğneli plan', kind: 'kart', fits: '2–4 etkinlik', accent: '#f43f5e', bg: '#0f172a', text: '#ffffff', scope: 'all', max: 4 },
  'k10-saatler': { label: 'Sahne saatleri', desc: 'Saat · etkinlik · mekân çizelgesi', kind: 'kart', fits: '3–8 etkinlik', accent: '#facc15', bg: '#1e1b4b', text: '#ffffff', scope: 'all', max: 8 },
  'k11-set': { label: 'Kaydırmalı set', desc: 'Kapak + her etkinliğe bir kare + kapanış', kind: 'kart', fits: '2–8 etkinlik', accent: '#a3e635', bg: '#7c2d12', text: '#ffffff', scope: 'set', max: 8 },
  'v1-turne': { label: 'Turne tarihleri', desc: 'Girişte şehir şehir tarih listesi, sonra her tarih', kind: 'video', fits: 'tek sanatçı, çok şehir', accent: '#e11d48', bg: '#07070b', text: '#ffffff', intro: 'turne', section: 'tektarih' },
  'v2-tektarih': { label: 'Tek tarih · sahne', desc: 'Video üstünde büyük renkli tarih, şehir, mekân', kind: 'video', fits: '1–3 etkinlik', accent: '#ff2d55', bg: '#05050a', text: '#ffffff', intro: 'default', section: 'tektarih' },
  'v3-hafta': { label: 'Şehrin bu haftası', desc: 'Girişte gün kutulu liste, sonra her etkinlik kartı', kind: 'video', fits: '3–10 etkinlik', accent: '#ff7a1a', bg: '#0b1320', text: '#ffffff', intro: 'hafta', section: 'kart' },
  'v4-minimal': { label: 'Minimal + alt şerit', desc: 'Ortada isim, altta tarih | mekân', kind: 'video', fits: '1–5 etkinlik', accent: '#a855f7', bg: '#0a0a0f', text: '#ffffff', intro: 'default', section: 'minimal' },
  'v5-gerisayim': { label: 'Geri sayım', desc: '«N gün kaldı» girişi, sonra etkinlik', kind: 'video', fits: '1–3 etkinlik', accent: '#ff4fd8', bg: '#120712', text: '#ffffff', intro: 'gerisayim', section: 'kart' },
  'v6-kinetik': { label: 'Kinetik yazı', desc: 'Kelimeler ritimle büyüyüp değişir', kind: 'video', fits: '1–5 etkinlik', accent: '#facc15', bg: '#0a0a0a', text: '#ffffff', intro: 'default', section: 'kinetik' },
  'v7-lineup': { label: 'Line-up açıklaması', desc: 'Girişte büyük isim listesi, sonra her etkinlik', kind: 'video', fits: '3–10 etkinlik', accent: '#38bdf8', bg: '#0c1b2e', text: '#ffffff', intro: 'lineup', section: 'kart' },
  'v8-bolunmus': { label: 'Bölünmüş ekran', desc: 'Girişte 2–3 etkinlik üst üste bantlarda', kind: 'video', fits: '2–3 etkinlik', accent: '#facc15', bg: '#000000', text: '#ffffff', intro: 'bolunmus', section: 'kart' },
  'v9-ozet': { label: 'Etkinlik sonrası özet', desc: '«Teşekkürler» girişi, kesitler ve sıradaki durak', kind: 'video', fits: 'geçmiş etkinlik + sıradakiler', accent: '#fb923c', bg: '#0a0a0a', text: '#ffffff', intro: 'ozet', section: 'kart' },
  'v10-altyazi': { label: 'Sanatçı + altyazı', desc: 'Anlatım altyazı olarak ekranda, altta bilgi şeridi', kind: 'video', fits: '1–3 etkinlik', accent: '#4ade80', bg: '#14532d', text: '#ffffff', intro: 'default', section: 'altyazi' },
  'v11-takvim': { label: 'Takvim kaydırma', desc: 'Girişte gün gün plan, sonra her etkinlik', kind: 'video', fits: '3–7 etkinlik (bir hafta)', accent: '#2563eb', bg: '#fde047', text: '#111111', intro: 'takvim', section: 'kart' },
}

export const isCardTemplate = (t: EventTemplate): t is CardTemplate => TEMPLATE_INFO[t].kind === 'kart'

/** Seçilen etkinlik sayısına göre önerilen şablonlar (ilk öneri başta). */
export function suggestTemplates(count: number, kind: 'kart' | 'video'): EventTemplate[] {
  if (kind === 'video') return count <= 1 ? ['v2-tektarih', 'v4-minimal', 'v6-kinetik', 'v10-altyazi', 'v5-gerisayim'] : count <= 3 ? ['v8-bolunmus', 'v2-tektarih', 'v4-minimal', 'v6-kinetik'] : ['v3-hafta', 'v11-takvim', 'v7-lineup', 'v1-turne']
  return count <= 1 ? ['k1-buyukisim', 'k4-bilet', 'k6-izgara', 'k7-risograf'] : count <= 3 ? ['k8-kolaj', 'k2-haftasonu', 'k9-harita', 'k11-set'] : ['k2-haftasonu', 'k10-saatler', 'k3-festival', 'k5-takvim', 'k11-set']
}

/** Kaydırmalı / tekli kart setinde kaç kare çıkar. */
export function cardCount(t: CardTemplate, events: number): number {
  const info = TEMPLATE_INFO[t]
  if (info.scope === 'each') return Math.min(10, Math.max(1, events))
  if (info.scope === 'set') return Math.min(10, Math.min(info.max ?? 8, events) + 2)
  return 1
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
export function cleanColors(raw: unknown, t: EventTemplate): { accent: string; bg: string; text: string } {
  const d = TEMPLATE_INFO[t]
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { accent: isHex(r.accent) ? r.accent : d.accent, bg: isHex(r.bg) ? r.bg : d.bg, text: isHex(r.text) ? r.text : d.text }
}

/** Türkçe gün kısaltması «28 Kasım Cuma» → «CUM» */
export function dayShort(date: string): string {
  const w = date.trim().split(/\s+/).pop() ?? ''
  const m: Record<string, string> = { Pazartesi: 'PZT', Salı: 'SAL', Çarşamba: 'ÇAR', Perşembe: 'PER', Cuma: 'CUM', Cumartesi: 'CMT', Pazar: 'PAZ' }
  return m[w] ?? w.slice(0, 3).toLocaleUpperCase('tr-TR')
}
export function dayLong(date: string): string {
  return (date.trim().split(/\s+/).pop() ?? '').toLocaleUpperCase('tr-TR')
}

/** Altyazı: anlatımı kısa satırlara böler (en çok ~34 karakter). */
export function subtitleChunks(text: string, maxLen = 34): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > maxLen && cur) {
      out.push(cur)
      cur = w
    } else cur = next
    if (/[.!?]$/.test(w) && cur.length > 12) {
      out.push(cur)
      cur = ''
    }
  }
  if (cur) out.push(cur)
  return out
}
