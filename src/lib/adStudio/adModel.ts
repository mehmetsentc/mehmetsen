/**
 * REKLAM STÜDYOSU — reklam projesi modeli (saf; sunucu ve tarayıcı ortak).
 * Bir reklam projesi KURGU motoruna derlenir (compileAd → EditProject, closing: false):
 * NaHaber logosu, yazısı ya da kapanış kartı ÇIKTIDA YOKTUR. Kapanışta yalnız firmanın kartı.
 * Ses: yalnız ücretli Gemini TTS (4 profesyonel ses); ücretsiz sese düşülmez.
 */
import { TRANSITION_MS, newItemId, timeline, type Aspect, type EditAsset, type EditProject, type FilterPreset, type MusicPreset, type TextItem, type Transition, type VideoClip, EMPTY_RENDER, type RenderState } from '@/lib/edit/editProject'

export const AD_PROJECTS = 'adProjects'

// ── reklam türleri ───────────────────────────────────────────────────────────
export const AD_KINDS = ['firma', 'urun', 'ilan', 'kampanya', 'acilis', 'hizmet'] as const
export type AdKind = (typeof AD_KINDS)[number]

// ── görünüm şablonları ───────────────────────────────────────────────────────
export const AD_LOOKS = ['sinematik', 'hizli', 'kurumsal', 'lux', 'kampanya', 'trend', 'ilan', 'belgesel'] as const
export type AdLook = (typeof AD_LOOKS)[number]

// ── yazı stilleri ────────────────────────────────────────────────────────────
export const AD_TEXT_STYLES = ['bant', 'guclu', 'vurgu', 'sinema', 'zarif', 'kurumsal', 'etiket', 'altyazi'] as const
export type AdTextStyle = (typeof AD_TEXT_STYLES)[number]

export const AD_TONES = ['etkileyici', 'sakin', 'coskulu', 'samimi'] as const
export type AdTone = (typeof AD_TONES)[number]

export const AD_MUSIC = ['sinematik', 'kurumsal', 'enerjik', 'duygusal', 'sakin', 'yok'] as const
export type AdMusic = (typeof AD_MUSIC)[number]

export const AD_ASPECTS = ['9:16', '4:5', '1:1', '16:9'] as const satisfies readonly Aspect[]
export type AdAspect = (typeof AD_ASPECTS)[number]

export const VIDEO_SOUNDS = ['kapali', 'kisik', 'acik'] as const
export type VideoSound = (typeof VIDEO_SOUNDS)[number]

export const TEXT_POSITIONS = ['alt', 'orta', 'ust'] as const
export type TextPos = (typeof TEXT_POSITIONS)[number]

export const LOGO_POSITIONS = ['sag-ust', 'sol-ust', 'sag-alt', 'sol-alt'] as const
export type LogoPos = (typeof LOGO_POSITIONS)[number]

type Deco = { kind: 'none' } | { kind: 'bars' } | { kind: 'frame' } | { kind: 'ribbon'; text: string; bg: string; fg: string }

export type LookInfo = {
  label: string
  desc: string
  filter: FilterPreset
  contrast: number
  saturation: number
  brightness: number
  transition: Transition
  deco: Deco
  style: AdTextStyle
  music: AdMusic
  accent: string
}

export const AD_LOOK_INFO: Record<AdLook, LookInfo> = {
  sinematik: { label: 'Sinematik', desc: 'Siyah sinema bantları, güçlü kontrast, ağır geçişler', filter: 'sinema', contrast: 1.08, saturation: 1, brightness: 0, transition: 'fade', deco: { kind: 'bars' }, style: 'guclu', music: 'sinematik', accent: '#ff5a1f' },
  hizli: { label: 'Hızlı & Dinamik', desc: 'Canlı renkler, kısa kayan geçişler, «HIZLI» şeridi', filter: 'canli', contrast: 1.05, saturation: 1.15, brightness: 0, transition: 'slideleft', deco: { kind: 'ribbon', text: 'HIZLI', bg: '#ff5a1f', fg: '#ffffff' }, style: 'vurgu', music: 'enerjik', accent: '#ff5a1f' },
  kurumsal: { label: 'Kurumsal', desc: 'Sade, güven veren; lacivert kart yazılar', filter: 'none', contrast: 1, saturation: 1, brightness: 0, transition: 'dissolve', deco: { kind: 'none' }, style: 'kurumsal', music: 'kurumsal', accent: '#22d3ee' },
  lux: { label: 'Lüks / Prestij', desc: 'İnce beyaz çerçeve, sıcak ton, zarif italik yazı', filter: 'sicak', contrast: 1.03, saturation: 0.95, brightness: 0, transition: 'fade', deco: { kind: 'frame' }, style: 'zarif', music: 'duygusal', accent: '#d4af37' },
  kampanya: { label: 'Kampanya', desc: 'Sarı «KAMPANYA» şeridi, etiket yazılar, enerjik', filter: 'canli', contrast: 1.04, saturation: 1.12, brightness: 0, transition: 'zoomin', deco: { kind: 'ribbon', text: 'KAMPANYA', bg: '#facc15', fg: '#111111' }, style: 'etiket', music: 'enerjik', accent: '#facc15' },
  trend: { label: 'Sosyal / Trend', desc: 'Reels tarzı altyazı yazılar, doğal renk', filter: 'none', contrast: 1, saturation: 1.05, brightness: 0, transition: 'slideup', deco: { kind: 'none' }, style: 'altyazi', music: 'enerjik', accent: '#ff5a1f' },
  ilan: { label: 'İş İlanı', desc: 'Mavi «İŞ İLANI» şeridi, okunaklı bant yazılar', filter: 'none', contrast: 1, saturation: 1, brightness: 0, transition: 'wipeleft', deco: { kind: 'ribbon', text: 'İŞ İLANI', bg: '#2563eb', fg: '#ffffff' }, style: 'bant', music: 'kurumsal', accent: '#2563eb' },
  belgesel: { label: 'Belgesel / Hikâye', desc: 'Nostaljik sıcak ton, sinema yazısı, sakin anlatım', filter: 'solgun', contrast: 1.02, saturation: 0.85, brightness: 0, transition: 'dissolve', deco: { kind: 'bars' }, style: 'sinema', music: 'duygusal', accent: '#f59e0b' },
}

export type KindInfo = { label: string; desc: string; look: AdLook; tone: AdTone; voice: AdVoiceId; ribbon: string | null; sample: string }
export const AD_KIND_INFO: Record<AdKind, KindInfo> = {
  firma: { label: 'Firma tanıtımı', desc: 'Firmanın hikâyesi, güveni, tecrübesi', look: 'sinematik', tone: 'etkileyici', voice: 'kaan', ribbon: null, sample: 'Yılların tecrübesi, güvenin adresi.' },
  urun: { label: 'Ürün reklamı', desc: 'Bir ürünü öne çıkarır: özellik, fiyat, çağrı', look: 'hizli', tone: 'coskulu', voice: 'mert', ribbon: null, sample: 'Yeni ürünümüz raflarda!' },
  ilan: { label: 'İş ilanı', desc: 'Pozisyon, şartlar ve başvuru bilgisi', look: 'ilan', tone: 'samimi', voice: 'ece', ribbon: 'İŞ İLANI', sample: 'Ekibimize katılacak arkadaşlar arıyoruz.' },
  kampanya: { label: 'Kampanya / İndirim', desc: 'Süreli fırsat, indirim oranı, son tarih', look: 'kampanya', tone: 'coskulu', voice: 'mert', ribbon: 'KAMPANYA', sample: 'Bu hafta tüm ürünlerde büyük indirim!' },
  acilis: { label: 'Açılış / Etkinlik', desc: 'Yeni şube, açılış günü, davet', look: 'lux', tone: 'etkileyici', voice: 'selin', ribbon: null, sample: 'Kapılarımızı sizler için açıyoruz.' },
  hizmet: { label: 'Hizmet tanıtımı', desc: 'Sunulan hizmet, avantajlar, iletişim', look: 'kurumsal', tone: 'samimi', voice: 'ece', ribbon: null, sample: 'İhtiyacınız olan çözüm bir telefon uzağınızda.' },
}

export const AD_TEXT_STYLE_INFO: Record<AdTextStyle, { label: string; desc: string }> = {
  bant: { label: 'Turuncu bant', desc: 'Beyaz kalın yazı, renkli bant — her ekranda okunur' },
  guclu: { label: 'Güçlü başlık', desc: 'Büyük, dik harfler, renkli dikey çizgi' },
  vurgu: { label: 'Vurgulu', desc: 'Kalın yazı, bir kelimesi renkli vurgulu' },
  sinema: { label: 'Sinema', desc: 'Geniş aralıklı büyük harf, koyu geçişli zemin' },
  zarif: { label: 'Zarif', desc: 'İtalik serif, koyu kart, altın çizgi' },
  kurumsal: { label: 'Kurumsal kart', desc: 'Lacivert kart, üstte ince renkli çizgi' },
  etiket: { label: 'Etiket', desc: 'Sarı, hafif eğik fiyat/kampanya etiketi' },
  altyazi: { label: 'Altyazı', desc: 'Koyu şeritte sade altyazı' },
}

// ── sesler (yalnız Gemini TTS, ücretli) ──────────────────────────────────────
export const AD_VOICE_IDS = ['kaan', 'ece', 'mert', 'selin'] as const
export type AdVoiceId = (typeof AD_VOICE_IDS)[number]
export const AD_VOICES: Record<AdVoiceId, { name: string; gender: 'Erkek' | 'Kadın'; desc: string; gemini: string; persona: string }> = {
  kaan: { name: 'Kaan', gender: 'Erkek', desc: 'Derin, güven veren', gemini: 'Charon', persona: 'a deep, warm, trustworthy mature male Turkish TV commercial announcer' },
  ece: { name: 'Ece', gender: 'Kadın', desc: 'Sıcak, samimi', gemini: 'Sulafat', persona: 'a warm, friendly, sincere female Turkish commercial voice' },
  mert: { name: 'Mert', gender: 'Erkek', desc: 'Enerjik, heyecanlı', gemini: 'Fenrir', persona: 'an energetic, upbeat young male Turkish promo announcer' },
  selin: { name: 'Selin', gender: 'Kadın', desc: 'Zarif, prestijli', gemini: 'Despina', persona: 'an elegant, smooth, premium female Turkish luxury-brand voice' },
}
export const AD_TONE_INFO: Record<AdTone, { label: string; prompt: string }> = {
  etkileyici: { label: 'Etkileyici', prompt: 'cinematic and moving, with gravitas; let key words land; natural dramatic pauses at ellipses' },
  sakin: { label: 'Sakin', prompt: 'calm, measured and reassuring; unhurried, soft emphasis' },
  coskulu: { label: 'Coşkulu', prompt: 'excited and enthusiastic, smiling voice, lively rhythm, punchy emphasis on offers' },
  samimi: { label: 'Samimi', prompt: 'conversational and sincere, like talking to a neighbour, warm smile' },
}
export const AD_MUSIC_INFO: Record<AdMusic, { label: string; bed: MusicPreset | null }> = {
  sinematik: { label: 'Sinematik', bed: 'modern' },
  kurumsal: { label: 'Kurumsal', bed: 'kurumsal' },
  enerjik: { label: 'Enerjik', bed: 'enerjik' },
  duygusal: { label: 'Duygusal', bed: 'akustik' },
  sakin: { label: 'Sakin', bed: 'sakin' },
  yok: { label: 'Müzik yok', bed: null },
}
export const VIDEO_SOUND_LABEL: Record<VideoSound, string> = { kapali: 'Kapalı', kisik: 'Konuşurken kısılır', acik: 'Hep olduğu gibi' }

/** Gemini-TTS stil yönergesi (İngilizce yönerge en tutarlı sonucu verir; metin Türkçe okunur). */
export function voicePrompt(voice: AdVoiceId, tone: AdTone, speed: number): string {
  const pace = speed <= 0.92 ? 'slightly slow pace' : speed >= 1.08 ? 'slightly brisk pace' : 'natural pace'
  return `Read this Turkish advertisement voice-over as ${AD_VOICES[voice].persona}. Delivery: ${AD_TONE_INFO[tone].prompt}; ${pace}. Studio-quality, clear diction, correct Turkish pronunciation and stress. Do not add any words.`
}

// ── proje ────────────────────────────────────────────────────────────────────
export interface AdMedia {
  id: string
  kind: 'video' | 'image'
  url: string
  name: string
  durationMs: number | null
  inMs: number
  outMs: number
  /** videonun kendi ses izi var mı (müzik / ortam sesi) — yüklemede ffmpeg ile okunur */
  hasAudio?: boolean
}
export interface AdScene {
  id: string
  text: string
  startMs: number
  endMs: number
  /** vurgu stili: renkli gösterilecek kelime (boş = son kelime) */
  emphasis: string
}
export interface AdCard {
  enabled: boolean
  name: string
  slogan: string
  phone: string
  address: string
  web: string
  durationMs: number
}
export interface AdVoiceState {
  url: string
  durationMs: number
  hash: string
  voice: AdVoiceId
  tone: AdTone
  speed: number
  chars: number
  createdAt: number
  /** konuşma başı/sonu ve duraklamalar (yazıları sese eşlemek için) */
  timing?: { speechStartMs: number; speechEndMs: number; pauses: Array<{ at: number; len: number }> }
  /** videoya uydurma: hangi hedefe göre (fitKey), ham ses, uygulanan hız ve eklenen duraklama */
  fitKey?: string
  rawUrl?: string
  rawDurationMs?: number
  tempo?: number
  addedPauseMs?: number
}
export interface AdProject {
  id: string
  title: string
  kind: AdKind
  look: AdLook
  aspect: AdAspect
  fit: 'cover' | 'blur'
  media: AdMedia[]
  script: string
  scenes: AdScene[]
  textOn: boolean
  textStyle: AdTextStyle
  textPos: TextPos
  textSize: number
  accent: string
  ribbonOn: boolean
  voiceOn: boolean
  voiceId: AdVoiceId
  tone: AdTone
  speed: number
  voiceStartMs: number
  /** seslendirme video süresine otomatik uydurulur (hız + cümle araları) */
  fitToVideo: boolean
  voice: AdVoiceState | null
  music: AdMusic
  videoSound: VideoSound
  logoUrl: string | null
  logoPos: LogoPos
  card: AdCard
  render: RenderState
  createdBy: string
  createdAt: number
  updatedAt: number
}

export const AD_LIMITS = { media: 20, scenes: 24, script: 1500, scene: 120, title: 100, totalMs: 180_000, imageMs: 3_000 }

export function defaultAd(id: string, uid: string, now: number, kind: AdKind = 'firma'): AdProject {
  const k = AD_KIND_INFO[kind]
  const look = AD_LOOK_INFO[k.look]
  return {
    id,
    title: 'Yeni reklam',
    kind,
    look: k.look,
    aspect: '9:16',
    fit: 'cover',
    media: [],
    script: '',
    scenes: [],
    textOn: true,
    textStyle: look.style,
    textPos: 'alt',
    textSize: 70,
    accent: look.accent,
    ribbonOn: look.deco.kind === 'ribbon',
    voiceOn: true,
    voiceId: k.voice,
    tone: k.tone,
    speed: 1,
    voiceStartMs: 1500,
    fitToVideo: true,
    voice: null,
    music: look.music,
    videoSound: 'kisik',
    logoUrl: null,
    logoPos: 'sag-ust',
    card: { enabled: true, name: '', slogan: '', phone: '', address: '', web: '', durationMs: 4000 },
    render: { ...EMPTY_RENDER },
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  }
}

/** Firestore'dan gelen eksik alanları tamamlar (eski kayıtlar). */
export function withAdDefaults(raw: Partial<AdProject> & { id: string }): AdProject {
  const d = defaultAd(raw.id, raw.createdBy ?? '', raw.createdAt ?? 0, isOneOf(AD_KINDS, raw.kind) ? raw.kind : 'firma')
  return { ...d, ...raw, card: { ...d.card, ...(raw.card ?? {}) }, render: { ...EMPTY_RENDER, ...(raw.render ?? {}) }, media: raw.media ?? [], scenes: raw.scenes ?? [] }
}

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v)
}

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max) : ''
const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null)
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export type PatchResult = { ok: true; value: AdProject } | { ok: false; error: string }

/**
 * Kullanıcının düzenlediği alanları doğrular. Medya URL'leri burada değişmez
 * (yalnız sıralama / kesim / silme); yeni medya sunucu tarafında `addMedia` ile eklenir.
 */
export function applyAdPatch(cur: AdProject, raw: Record<string, unknown>, now: number): PatchResult {
  const n: AdProject = { ...cur, card: { ...cur.card } }
  if ('title' in raw) n.title = clean(raw.title, AD_LIMITS.title) || 'Reklam'
  if ('kind' in raw) {
    if (!isOneOf(AD_KINDS, raw.kind)) return { ok: false, error: 'Reklam türü geçersiz' }
    n.kind = raw.kind
  }
  if ('look' in raw) {
    if (!isOneOf(AD_LOOKS, raw.look)) return { ok: false, error: 'Şablon geçersiz' }
    n.look = raw.look
  }
  if ('aspect' in raw) {
    if (!isOneOf(AD_ASPECTS, raw.aspect)) return { ok: false, error: 'Biçim geçersiz' }
    n.aspect = raw.aspect
  }
  if ('fit' in raw) n.fit = raw.fit === 'blur' ? 'blur' : 'cover'
  if ('script' in raw) n.script = typeof raw.script === 'string' ? raw.script.replace(/\r/g, '').slice(0, AD_LIMITS.script) : ''
  if ('textOn' in raw) n.textOn = raw.textOn === true
  if ('textStyle' in raw) {
    if (!isOneOf(AD_TEXT_STYLES, raw.textStyle)) return { ok: false, error: 'Yazı stili geçersiz' }
    n.textStyle = raw.textStyle
  }
  if ('textPos' in raw) {
    if (!isOneOf(TEXT_POSITIONS, raw.textPos)) return { ok: false, error: 'Yazı yeri geçersiz' }
    n.textPos = raw.textPos
  }
  if ('textSize' in raw) n.textSize = num(raw.textSize, 36, 110) ?? cur.textSize
  if ('accent' in raw) {
    if (!isColor(raw.accent)) return { ok: false, error: 'Renk geçersiz' }
    n.accent = raw.accent
  }
  if ('ribbonOn' in raw) n.ribbonOn = raw.ribbonOn === true
  if ('voiceOn' in raw) n.voiceOn = raw.voiceOn === true
  if ('voiceId' in raw) {
    if (!isOneOf(AD_VOICE_IDS, raw.voiceId)) return { ok: false, error: 'Ses geçersiz' }
    n.voiceId = raw.voiceId
  }
  if ('tone' in raw) {
    if (!isOneOf(AD_TONES, raw.tone)) return { ok: false, error: 'Ton geçersiz' }
    n.tone = raw.tone
  }
  if ('speed' in raw) n.speed = Math.round((num(raw.speed, 0.8, 1.2) ?? cur.speed) * 100) / 100
  if ('fitToVideo' in raw) n.fitToVideo = raw.fitToVideo === true
  if ('voiceStartMs' in raw) n.voiceStartMs = Math.round(num(raw.voiceStartMs, 0, 60_000) ?? cur.voiceStartMs)
  if ('music' in raw) {
    if (!isOneOf(AD_MUSIC, raw.music)) return { ok: false, error: 'Müzik geçersiz' }
    n.music = raw.music
  }
  if ('videoSound' in raw) {
    if (!isOneOf(VIDEO_SOUNDS, raw.videoSound)) return { ok: false, error: 'Video sesi seçeneği geçersiz' }
    n.videoSound = raw.videoSound
  }
  if ('logoPos' in raw) {
    if (!isOneOf(LOGO_POSITIONS, raw.logoPos)) return { ok: false, error: 'Logo yeri geçersiz' }
    n.logoPos = raw.logoPos
  }
  if ('logoUrl' in raw && raw.logoUrl === null) n.logoUrl = null
  if ('card' in raw && raw.card && typeof raw.card === 'object') {
    const c = raw.card as Record<string, unknown>
    if ('enabled' in c) n.card.enabled = c.enabled === true
    if ('name' in c) n.card.name = clean(c.name, 60)
    if ('slogan' in c) n.card.slogan = clean(c.slogan, 90)
    if ('phone' in c) n.card.phone = clean(c.phone, 30)
    if ('address' in c) n.card.address = clean(c.address, 80)
    if ('web' in c) n.card.web = clean(c.web, 60)
    if ('durationMs' in c) n.card.durationMs = Math.round(num(c.durationMs, 2000, 8000) ?? n.card.durationMs)
  }
  if ('media' in raw) {
    if (!Array.isArray(raw.media)) return { ok: false, error: 'Medya listesi geçersiz' }
    const byId = new Map(cur.media.map((m) => [m.id, m]))
    const next: AdMedia[] = []
    for (const x of raw.media as Array<Record<string, unknown>>) {
      const m = byId.get(String(x?.id ?? ''))
      if (!m) continue // yalnız var olan medya; yeni URL kabul edilmez
      const max = m.kind === 'image' ? 15_000 : (m.durationMs ?? AD_LIMITS.totalMs)
      let inMs = Math.round(num(x.inMs, 0, max) ?? m.inMs)
      let outMs = Math.round(num(x.outMs, 0, max) ?? m.outMs)
      if (m.kind === 'image') inMs = 0
      if (outMs - inMs < 500) outMs = Math.min(max, inMs + 500)
      if (outMs - inMs < 500) inMs = Math.max(0, outMs - 500)
      next.push({ ...m, inMs, outMs })
    }
    n.media = next
  }
  if ('scenes' in raw) {
    if (!Array.isArray(raw.scenes)) return { ok: false, error: 'Sahne listesi geçersiz' }
    const sc: AdScene[] = []
    for (const x of (raw.scenes as Array<Record<string, unknown>>).slice(0, AD_LIMITS.scenes)) {
      const text = clean(x?.text, AD_LIMITS.scene)
      if (!text) continue
      const startMs = Math.round(num(x.startMs, 0, AD_LIMITS.totalMs) ?? 0)
      const endMs = Math.round(num(x.endMs, 0, AD_LIMITS.totalMs) ?? startMs + 3000)
      sc.push({ id: typeof x.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x.id) ? x.id : newItemId(), text, startMs, endMs: Math.max(startMs + 400, endMs), emphasis: clean(x.emphasis, 40) })
    }
    n.scenes = sc.sort((a, b) => a.startMs - b.startMs)
  }
  n.updatedAt = now
  return { ok: true, value: n }
}

// ── süre ve sahneler ─────────────────────────────────────────────────────────
export function mediaClips(ad: Pick<AdProject, 'media' | 'look'>): Array<Pick<VideoClip, 'inMs' | 'outMs' | 'speed' | 'transition'>> {
  const tr = AD_LOOK_INFO[ad.look].transition
  return ad.media.map((m, i) => ({ inMs: m.inMs, outMs: m.outMs, speed: 1, transition: i === 0 ? 'none' : tr }))
}
export function adTotalMs(ad: Pick<AdProject, 'media' | 'look'>): number {
  return ad.media.length ? timeline(mediaClips(ad)).total : 0
}
/** yazıların bitmesi gereken an: firma kartı açıksa onun başlangıcı */
export function textWindowEnd(ad: Pick<AdProject, 'media' | 'look' | 'card'>): number {
  const total = adTotalMs(ad)
  return ad.card.enabled ? Math.max(0, total - ad.card.durationMs) : total
}

/** Reklam metnini okunur sahne yazılarına böler (cümle / üç nokta / ünlem; uzun cümle virgülden). */
export function splitScript(script: string): string[] {
  const flat = script.replace(/\s+/g, ' ').trim()
  if (!flat) return []
  const parts = flat
    .split(/(?<=[.!?…])\s+|(?<=\.\.\.)\s*/)
    .map((s) => s.replace(/^[.…\s]+/, '').trim())
    .filter((s) => s.replace(/[.…!?,\s]/g, '').length > 0)
  const out: string[] = []
  for (const p of parts) {
    if (p.length <= 70) {
      out.push(p)
      continue
    }
    // uzun cümle: virgüllerden ~ 40-70 karakterlik parçalara
    const bits = p.split(/(?<=,)\s+/)
    let buf = ''
    for (const b of bits) {
      if (buf && (buf + ' ' + b).length > 70) {
        out.push(buf)
        buf = b
      } else buf = buf ? `${buf} ${b}` : b
    }
    if (buf) out.push(buf)
  }
  // virgülsüz uzun parça: kelimelerden dengeli böl
  const fine: string[] = []
  for (const s of out) {
    if (s.length <= 72) {
      fine.push(s)
      continue
    }
    const words = s.split(' ')
    const n = Math.ceil(s.length / 60)
    const per = Math.ceil(s.length / n)
    let buf = ''
    for (const w of words) {
      if (buf && (buf + ' ' + w).length > per + 8) {
        fine.push(buf)
        buf = w
      } else buf = buf ? `${buf} ${w}` : w
    }
    if (buf) fine.push(buf)
  }
  return fine
    .map((s) => s.replace(/[,;:]\s*$/, '').replace(/\.{3}$/, '…').replace(/(?<!\.)\.$/, ''))
    .filter(Boolean)
    .slice(0, AD_LIMITS.scenes)
}

/** Sahneleri yazı uzunluğuna göre [from, to] arasına dağıtır (seslendirme varsa onun süresine). */
export function timeScenes(lines: string[], fromMs: number, toMs: number): AdScene[] {
  if (!lines.length || toMs - fromMs < 600) return []
  const w = lines.map((l) => Math.max(8, [...l].length))
  const sum = w.reduce((a, b) => a + b, 0)
  let t = fromMs
  return lines.map((text, i) => {
    const len = ((toMs - fromMs) * w[i]!) / sum
    const s = { id: newItemId(), text, startMs: Math.round(t), endMs: Math.round(t + len - (i < lines.length - 1 ? 120 : 0)), emphasis: '' }
    t += len
    return s
  })
}

export function voiceHashInput(ad: Pick<AdProject, 'script' | 'voiceId' | 'tone' | 'speed'>): string {
  return JSON.stringify(['adv1', ad.voiceId, ad.tone, ad.speed, ad.script.replace(/\s+/g, ' ').trim()])
}
export function fnv(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 ^ c, 2246822507)
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 16)
}
export const voiceHash = (ad: Pick<AdProject, 'script' | 'voiceId' | 'tone' | 'speed'>) => fnv(voiceHashInput(ad))
/** Seslendirmenin videoda kaplayacağı aralık: başlangıç gecikmesinden firma kartının 0,8 sn öncesine. */
export function fitTarget(ad: Pick<AdProject, 'media' | 'look' | 'card' | 'voiceStartMs' | 'fitToVideo'>): { startMs: number; endMs: number } | null {
  if (!ad.fitToVideo || !ad.media.length) return null
  const end = textWindowEnd(ad) - 800
  return end - ad.voiceStartMs >= 3000 ? { startMs: ad.voiceStartMs, endMs: end } : null
}
export const fitKey = (ad: Pick<AdProject, 'media' | 'look' | 'card' | 'voiceStartMs' | 'fitToVideo'>): string => {
  const t = fitTarget(ad)
  return t ? `fit-${t.endMs - t.startMs}` : 'off'
}
/** metin + ses aynı mı (yeni ücretli ses gerekmez) */
export const voiceTextCurrent = (ad: AdProject) => !!ad.voice && ad.voice.hash === voiceHash(ad)
/** ses hem metne hem video süresine göre güncel mi */
export const voiceIsCurrent = (ad: AdProject) => voiceTextCurrent(ad) && (ad.voice!.fitKey ?? 'off') === fitKey(ad)

export function adRenderProblem(ad: AdProject): string | null {
  if (!ad.media.length) return 'Önce reklam videosunu ya da görselini ekleyin'
  const total = adTotalMs(ad)
  if (total < 1500) return 'Reklam en az 1,5 saniye olmalı'
  if (total > AD_LIMITS.totalMs) return 'Reklam en fazla 3 dakika olabilir'
  if (ad.voiceOn && !ad.script.trim()) return 'Seslendirme açık ama reklam metni boş'
  if (ad.voiceOn && !voiceTextCurrent(ad)) return 'Metin ya da ses seçimi değişti — önce «Seslendirmeyi oluştur»'
  if (ad.voiceOn && !voiceIsCurrent(ad)) return 'Video süresi değişti — «Ses» adımında «Sesi videoya uydur» (ücretsiz)'
  if (ad.card.enabled && !ad.card.name.trim()) return 'Kapanış kartı için firma adını yazın (ya da kartı kapatın)'
  return null
}

export function adRenderKey(ad: AdProject): string {
  return fnv(JSON.stringify(['ad2', ad.aspect, ad.fit, ad.look, ad.media, ad.textOn ? [ad.scenes, ad.textStyle, ad.textPos, ad.textSize] : 0, ad.accent, ad.ribbonOn, ad.voiceOn ? ad.voice?.url : 0, ad.voiceStartMs, usesOwnMusic(ad) ? 'own' : ad.music, ad.videoSound, ad.logoUrl, ad.logoPos, ad.card]))
}

/** Videonun kendi sesi (müziği) kullanılıyorsa bizim fon müziğimiz eklenmez. */
export function usesOwnMusic(ad: Pick<AdProject, 'media' | 'videoSound'>): boolean {
  return ad.videoSound !== 'kapali' && ad.media.some((m) => m.kind === 'video' && m.hasAudio === true)
}

// ── KURGU'ya derleme ─────────────────────────────────────────────────────────
export type AdOverlay =
  | { type: 'deco'; deco: Deco }
  | { type: 'text'; style: AdTextStyle; text: string; emphasis: string; pos: TextPos; size: number; accent: string }
  | { type: 'card'; card: AdCard; accent: string; look: AdLook; logoUrl: string | null }
  | { type: 'logo'; url: string; pos: LogoPos }

export function ribbonFor(ad: AdProject): Deco | null {
  if (!ad.ribbonOn) return null
  const d = AD_LOOK_INFO[ad.look].deco
  if (d.kind === 'ribbon') return d
  const k = AD_KIND_INFO[ad.kind].ribbon
  return k ? { kind: 'ribbon', text: k, bg: ad.accent, fg: '#ffffff' } : null
}

/** videonun kendi sesi konuşma sırasında kısılsın mı */
export const duckUnderVoice = (ad: Pick<AdProject, 'voiceOn' | 'voice' | 'videoSound'>): boolean => ad.voiceOn && !!ad.voice && ad.videoSound === 'kisik'

export function compileAd(ad: AdProject): { project: EditProject; overlays: Map<string, AdOverlay> } {
  const look = AD_LOOK_INFO[ad.look]
  const assets: EditAsset[] = ad.media.map((m) => ({ id: `m_${m.id}`, kind: m.kind, source: 'upload', url: m.url, name: m.name, durationMs: m.durationMs, posterUrl: null, addedAt: ad.createdAt }))
  // kısık: seslendirme varken videonun müziği konuşmanın altında kalır
  // kısık: videonun sesi tam, seslendirme konuşurken otomatik kısılır (ffmpeg sidechain, duck)
  const own = ad.videoSound === 'kapali' ? 0 : 1
  const clips: VideoClip[] = ad.media.map((m, i) => ({
    id: `c_${m.id}`,
    assetId: `m_${m.id}`,
    inMs: m.inMs,
    outMs: m.outMs,
    speed: 1,
    volume: own,
    mute: own === 0,
    crop: null,
    rotate: 0,
    flipH: false,
    scale: 1,
    posX: 0,
    posY: 0,
    fit: ad.fit,
    brightness: look.brightness,
    contrast: look.contrast,
    saturation: look.saturation,
    filter: look.filter,
    transition: i === 0 ? 'none' : look.transition,
    animIn: i === 0 ? 'fade' : 'none',
    animOut: i === ad.media.length - 1 && !ad.card.enabled ? 'fade' : 'none',
  }))
  const total = clips.length ? timeline(clips).total : 0
  const overlays = new Map<string, AdOverlay>()
  const texts: TextItem[] = []
  const push = (id: string, startMs: number, endMs: number, o: AdOverlay) => {
    if (endMs - startMs < 200) return
    overlays.set(id, o)
    texts.push({ id, text: o.type === 'text' ? o.text : o.type, startMs, endMs, style: 'sade', x: 0.5, y: 0.5, size: 60, color: '#FFFFFF' })
  }
  const cardStart = ad.card.enabled ? Math.max(0, total - ad.card.durationMs) : total
  // 1. süs: sinema bantları / çerçeve (tüm video), şerit (kart öncesi)
  if (look.deco.kind === 'bars' || look.deco.kind === 'frame') push('o_deco', 0, cardStart, { type: 'deco', deco: look.deco })
  const rib = ribbonFor(ad)
  if (rib) push('o_ribbon', 0, cardStart, { type: 'deco', deco: rib })
  // 2. sahne yazıları
  if (ad.textOn)
    ad.scenes.forEach((s, i) => {
      const from = Math.max(0, s.startMs)
      const to = Math.min(s.endMs, cardStart)
      if (from < to) push(`o_t${i}`, from, to, { type: 'text', style: ad.textStyle, text: s.text, emphasis: s.emphasis, pos: ad.textPos, size: ad.textSize, accent: ad.accent })
    })
  // 3. firma logosu (kart öncesi; kartın içinde ayrıca)
  if (ad.logoUrl) push('o_logo', 0, cardStart, { type: 'logo', url: ad.logoUrl, pos: ad.logoPos })
  // 4. firma kapanış kartı (videonun son saniyelerinin üstünde, opak)
  if (ad.card.enabled && total > 0) push('o_card', cardStart, total, { type: 'card', card: ad.card, accent: ad.accent, look: ad.look, logoUrl: ad.logoUrl })

  const audio: EditProject['audio'] = []
  if (ad.voiceOn && ad.voice) {
    assets.push({ id: 'voice', kind: 'audio', source: 'tts', url: ad.voice.url, name: 'Seslendirme', durationMs: ad.voice.durationMs, posterUrl: null, addedAt: ad.voice.createdAt })
    audio.push({ id: 'a_voice', kind: 'voice', assetId: 'voice', music: null, text: null, startMs: ad.voiceStartMs, endMs: ad.voiceStartMs + ad.voice.durationMs, volume: 1, fade: false })
  }
  const bed = usesOwnMusic(ad) ? null : AD_MUSIC_INFO[ad.music].bed
  if (bed) audio.push({ id: 'a_music', kind: 'music', assetId: null, music: bed, text: null, startMs: 0, endMs: null, volume: ad.voiceOn ? 0.14 : 0.42, fade: true })

  const project: EditProject = {
    id: `ad_${ad.id}`,
    title: ad.title,
    caption: '',
    aspect: ad.aspect,
    assets,
    clips,
    texts,
    audio,
    closing: false, // REKLAM: NaHaber kapanışı ASLA yok
    linkedNewsId: null,
    newsVideo: false,
    newsApplied: null,
    render: { ...EMPTY_RENDER },
    createdBy: ad.createdBy,
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt,
  }
  return { project, overlays }
}

export const AD_TRANSITION_MS = TRANSITION_MS
