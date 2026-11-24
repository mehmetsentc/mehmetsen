/**
 * KURGU — CapCut düzenindeki video editörünün proje modeli (saf, tarayıcıda da çalışır).
 *
 * Bir kurgu projesi: medya (video / görsel / ses), ana video izi (sırayla klipler),
 * metin izi, ses izi (müzik, seslendirme) ve tuval oranı. Sunucu tek seferde MP4 üretir
 * (bkz. editRender.ts); tarayıcı yalnız yaklaşık önizleme yapar.
 */

export const EDIT_PROJECTS = 'editProjects'

export const ASPECTS = ['9:16', '16:9', '1:1', '4:5', '4:3', 'original'] as const
export type Aspect = (typeof ASPECTS)[number]
export const ASPECT_LABEL: Record<Aspect, string> = { '9:16': '9:16 Reels / Shorts', '16:9': '16:9 YouTube', '1:1': '1:1 Kare', '4:5': '4:5 Gönderi', '4:3': '4:3', original: 'Orijinal' }

export type AssetKind = 'video' | 'image' | 'audio'
export type AssetSource = 'library' | 'upload' | 'news' | 'tts'
export interface EditAsset {
  id: string
  kind: AssetKind
  source: AssetSource
  /** https file URL the renderer downloads */
  url: string
  /** Video Kütüphanesi item (library videos) */
  libraryId?: string | null
  name: string
  durationMs: number | null
  posterUrl?: string | null
  addedAt: number
}

export interface Crop {
  /** normalised to the source picture, 0..1 */
  x: number
  y: number
  w: number
  h: number
}

export const TRANSITIONS = ['none', 'fade', 'dissolve', 'slideleft', 'slideright', 'slideup', 'wipeleft', 'circleopen', 'zoomin'] as const
export type Transition = (typeof TRANSITIONS)[number]
export const TRANSITION_LABEL: Record<Transition, string> = { none: 'Yok (kesme)', fade: 'Kararma', dissolve: 'Çözülme', slideleft: 'Sola kay', slideright: 'Sağa kay', slideup: 'Yukarı kay', wipeleft: 'Silme', circleopen: 'Daire aç', zoomin: 'Yakınlaş' }

export const FILTERS = ['none', 'canli', 'sicak', 'soguk', 'siyahbeyaz', 'sinema', 'solgun'] as const
export type FilterPreset = (typeof FILTERS)[number]
export const FILTER_LABEL: Record<FilterPreset, string> = { none: 'Yok', canli: 'Canlı', sicak: 'Sıcak', soguk: 'Soğuk', siyahbeyaz: 'Siyah-beyaz', sinema: 'Sinema', solgun: 'Solgun' }

export type Fit = 'cover' | 'contain' | 'blur'
export type ClipAnim = 'none' | 'fade' | 'zoom'

export interface VideoClip {
  id: string
  assetId: string
  /** part of the source used (images: 0..duration) */
  inMs: number
  outMs: number
  speed: number
  volume: number
  mute: boolean
  crop: Crop | null
  /** degrees, -180..180 */
  rotate: number
  flipH: boolean
  /** 1 = fills the frame per `fit` */
  scale: number
  /** -1..1: offset as a fraction of half the frame */
  posX: number
  posY: number
  fit: Fit
  brightness: number
  contrast: number
  saturation: number
  filter: FilterPreset
  /** transition INTO this clip from the previous one */
  transition: Transition
  animIn: ClipAnim
  animOut: ClipAnim
}

export const TEXT_STYLES = ['baslik', 'altyazi', 'altbant', 'etiket', 'sade'] as const
export type TextStyle = (typeof TEXT_STYLES)[number]
export const TEXT_STYLE_LABEL: Record<TextStyle, string> = { baslik: 'Büyük başlık', altyazi: 'Altyazı', altbant: 'Alt bant (haber)', etiket: 'Etiket', sade: 'Sade yazı' }

export interface TextItem {
  id: string
  text: string
  startMs: number
  endMs: number
  style: TextStyle
  /** centre, 0..1 of the frame */
  x: number
  y: number
  /** font size in px at a 1080-px short side */
  size: number
  color: string
}

export type AudioKind = 'music' | 'voice'
export const MUSIC_PRESETS = ['sondakika', 'kurumsal', 'enerjik', 'modern', 'sakin', 'akustik', 'lofi'] as const
export type MusicPreset = (typeof MUSIC_PRESETS)[number]
export const MUSIC_LABEL: Record<MusicPreset, string> = { sondakika: 'Son dakika', kurumsal: 'Kurumsal', enerjik: 'Enerjik', modern: 'Modern', sakin: 'Sakin', akustik: 'Akustik', lofi: 'Lo-fi' }

export interface AudioItem {
  id: string
  kind: AudioKind
  /** voice: the TTS asset; music: null when a preset bed is used */
  assetId: string | null
  music: MusicPreset | null
  /** voice: what was read out (shown on the track) */
  text: string | null
  startMs: number
  /** null = until the video ends (music) / the whole file (voice) */
  endMs: number | null
  volume: number
  fade: boolean
}

export type RenderState = { status: 'none' | 'ready' | 'failed'; key: string | null; outputUrl: string | null; coverUrl: string | null; seconds: number | null; error: string | null; renderedAt: number | null }
export const EMPTY_RENDER: RenderState = { status: 'none', key: null, outputUrl: null, coverUrl: null, seconds: null, error: null, renderedAt: null }

export interface EditProject {
  id: string
  title: string
  caption: string
  aspect: Aspect
  assets: EditAsset[]
  clips: VideoClip[]
  texts: TextItem[]
  audio: AudioItem[]
  /** nahaber.com closing card; only a news item's own video may switch it off */
  closing: boolean
  linkedNewsId: string | null
  /** the project was opened from a news item's own video («Videoyu düzenle») */
  newsVideo: boolean
  newsApplied: { url: string; at: number; by: string } | null
  render: RenderState
  createdBy: string
  createdAt: number
  updatedAt: number
}

// ── limits ───────────────────────────────────────────────────────────────────

export const MAX_ASSETS = 60
export const MAX_CLIPS = 60
export const MAX_TEXTS = 40
export const MAX_AUDIO = 12
export const MAX_TOTAL_MS = 180_000
export const MIN_CLIP_MS = 300
export const IMAGE_DEFAULT_MS = 3_000
export const TRANSITION_MS = 500
export const CUT_MS = 40
export const CLOSING_MS = 2_600
export const TITLE_MAX = 140
export const CAPTION_MAX = 2000
export const TEXT_MAX = 300

// ── geometry / timing ────────────────────────────────────────────────────────

/** Output size of the canvas (even, short side 1080). `original` follows the first video's shape. */
export function canvasSize(aspect: Aspect, firstVideo?: { w: number; h: number } | null): [number, number] {
  switch (aspect) {
    case '9:16':
      return [1080, 1920]
    case '16:9':
      return [1920, 1080]
    case '1:1':
      return [1080, 1080]
    case '4:5':
      return [1080, 1350]
    case '4:3':
      return [1440, 1080]
    default: {
      if (!firstVideo || !firstVideo.w || !firstVideo.h) return [1080, 1920]
      const k = 1080 / Math.min(firstVideo.w, firstVideo.h)
      const even = (n: number) => Math.round((n * k) / 2) * 2
      return [Math.min(1920, even(firstVideo.w)), Math.min(1920, even(firstVideo.h))]
    }
  }
}

/** Seconds a clip lasts on the timeline. */
export const clipMs = (c: Pick<VideoClip, 'inMs' | 'outMs' | 'speed'>): number => Math.max(MIN_CLIP_MS, Math.round((c.outMs - c.inMs) / (c.speed || 1)))
/** Overlap between clip i-1 and clip i (transition into i); never more than half of either clip. */
export function overlapMs(prev: Pick<VideoClip, 'inMs' | 'outMs' | 'speed'>, c: Pick<VideoClip, 'inMs' | 'outMs' | 'speed' | 'transition'>): number {
  const base = c.transition === 'none' ? CUT_MS : TRANSITION_MS
  return Math.min(base, Math.floor(clipMs(prev) / 2), Math.floor(clipMs(c) / 2))
}

/** Start / end of every clip on the timeline (transitions overlap the clips around them). */
export function timeline(clips: Array<Pick<VideoClip, 'inMs' | 'outMs' | 'speed' | 'transition'>>): { starts: number[]; ends: number[]; overlaps: number[]; total: number } {
  const starts: number[] = []
  const ends: number[] = []
  const overlaps: number[] = []
  let t = 0
  clips.forEach((c, i) => {
    const ov = i === 0 ? 0 : overlapMs(clips[i - 1]!, c)
    const s = t - ov
    overlaps.push(ov)
    starts.push(s)
    ends.push(s + clipMs(c))
    t = s + clipMs(c)
  })
  return { starts, ends, overlaps, total: clips.length ? t : 0 }
}

// ── validation ───────────────────────────────────────────────────────────────

const ID_RE = /^[a-z0-9]{4,16}$/
export const isItemId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)
export const isEditProjectId = (v: unknown): v is string => typeof v === 'string' && /^ep[a-f0-9]{16}$/.test(v)
export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string; message: string }
const bad = <T,>(field: string, message: string): Parsed<T> => ({ ok: false, field, message })

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').trim().slice(0, max)
}
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const ms = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : NaN)
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : d)
const COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function parseCrop(raw: unknown): Crop | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = num(o.x, 0, 0, 0.95)
  const y = num(o.y, 0, 0, 0.95)
  const w = num(o.w, 1, 0.05, 1 - x)
  const h = num(o.h, 1, 0.05, 1 - y)
  if (x === 0 && y === 0 && w >= 0.999 && h >= 0.999) return null
  const r = (n: number) => Math.round(n * 10000) / 10000
  return { x: r(x), y: r(y), w: r(w), h: r(h) }
}

export function parseClip(raw: unknown, assets: EditAsset[]): Parsed<VideoClip> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!isItemId(o.id)) return bad('clips.id', 'Klip kimliği geçersiz')
  const asset = assets.find((a) => a.id === o.assetId)
  if (!asset || asset.kind === 'audio') return bad('clips.assetId', 'Klibin medyası bulunamadı')
  let inMs = ms(o.inMs)
  let outMs = ms(o.outMs)
  if (asset.kind === 'image') {
    inMs = 0
    outMs = Number.isFinite(outMs) ? Math.min(60_000, Math.max(MIN_CLIP_MS, outMs)) : IMAGE_DEFAULT_MS
  }
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs) || outMs - inMs < MIN_CLIP_MS) return bad('clips.range', 'Klip en az 0,3 sn olmalı')
  if (asset.kind === 'video' && asset.durationMs && outMs > asset.durationMs + 250) outMs = asset.durationMs
  return {
    ok: true,
    value: {
      id: o.id,
      assetId: asset.id,
      inMs,
      outMs,
      speed: Math.round(num(o.speed, 1, 0.25, 4) * 100) / 100,
      volume: Math.round(num(o.volume, 1, 0, 2) * 100) / 100,
      mute: o.mute === true,
      crop: parseCrop(o.crop),
      rotate: Math.round(num(o.rotate, 0, -180, 180)),
      flipH: o.flipH === true,
      scale: Math.round(num(o.scale, 1, 0.3, 4) * 100) / 100,
      posX: Math.round(num(o.posX, 0, -1, 1) * 1000) / 1000,
      posY: Math.round(num(o.posY, 0, -1, 1) * 1000) / 1000,
      fit: pick(o.fit, ['cover', 'contain', 'blur'] as const, 'blur'),
      brightness: Math.round(num(o.brightness, 0, -0.5, 0.5) * 100) / 100,
      contrast: Math.round(num(o.contrast, 1, 0.3, 2) * 100) / 100,
      saturation: Math.round(num(o.saturation, 1, 0, 3) * 100) / 100,
      filter: pick(o.filter, FILTERS, 'none'),
      transition: pick(o.transition, TRANSITIONS, 'none'),
      animIn: pick(o.animIn, ['none', 'fade', 'zoom'] as const, 'none'),
      animOut: pick(o.animOut, ['none', 'fade', 'zoom'] as const, 'none'),
    },
  }
}

export function parseText(raw: unknown): Parsed<TextItem> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!isItemId(o.id)) return bad('texts.id', 'Metin kimliği geçersiz')
  const text = cleanText(o.text, TEXT_MAX)
  if (!text) return bad('texts.text', 'Metin boş olamaz')
  const s = ms(o.startMs)
  const e = ms(o.endMs)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e - s < 300) return bad('texts.range', 'Metin en az 0,3 sn görünmeli')
  return {
    ok: true,
    value: { id: o.id, text, startMs: s, endMs: e, style: pick(o.style, TEXT_STYLES, 'altyazi'), x: num(o.x, 0.5, 0, 1), y: num(o.y, 0.8, 0, 1), size: Math.round(num(o.size, 64, 20, 200)), color: typeof o.color === 'string' && COLOR_RE.test(o.color) ? o.color : '#FFFFFF' },
  }
}

export function parseAudio(raw: unknown, assets: EditAsset[]): Parsed<AudioItem> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!isItemId(o.id)) return bad('audio.id', 'Ses kimliği geçersiz')
  const kind = pick(o.kind, ['music', 'voice'] as const, 'music')
  const asset = typeof o.assetId === 'string' ? assets.find((a) => a.id === o.assetId && a.kind === 'audio') : undefined
  const music = kind === 'music' && !asset ? pick(o.music, MUSIC_PRESETS, 'modern') : null
  if (kind === 'voice' && !asset) return bad('audio.assetId', 'Seslendirme dosyası bulunamadı')
  const s = ms(o.startMs)
  const e = o.endMs === null || o.endMs === undefined ? null : ms(o.endMs)
  if (!Number.isFinite(s)) return bad('audio.range', 'Sesin başlangıcı geçersiz')
  if (e !== null && (!Number.isFinite(e) || e - s < 300)) return bad('audio.range', 'Ses en az 0,3 sn olmalı')
  return {
    ok: true,
    value: { id: o.id, kind, assetId: asset?.id ?? null, music, text: cleanText(o.text, 2000) || null, startMs: s, endMs: e, volume: Math.round(num(o.volume, kind === 'music' ? 0.25 : 1, 0, 2) * 100) / 100, fade: o.fade !== false },
  }
}

/** Client edit → stored project fields (render fields stay server-owned). */
export function parseEdit(raw: Record<string, unknown>, prev: EditProject): Parsed<Pick<EditProject, 'title' | 'caption' | 'aspect' | 'clips' | 'texts' | 'audio' | 'closing'>> {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k)
  const assets = prev.assets
  let clips = prev.clips
  if (has('clips')) {
    if (!Array.isArray(raw.clips) || raw.clips.length > MAX_CLIPS) return bad('clips', `En fazla ${MAX_CLIPS} klip`)
    const out: VideoClip[] = []
    for (const c of raw.clips) {
      const r = parseClip(c, assets)
      if (!r.ok) return r
      if (out.some((x) => x.id === r.value.id)) return bad('clips.id', 'Aynı klip iki kez')
      out.push(r.value)
    }
    clips = out
  }
  let texts = prev.texts
  if (has('texts')) {
    if (!Array.isArray(raw.texts) || raw.texts.length > MAX_TEXTS) return bad('texts', `En fazla ${MAX_TEXTS} metin`)
    const out: TextItem[] = []
    for (const t of raw.texts) {
      const r = parseText(t)
      if (!r.ok) return r
      out.push(r.value)
    }
    texts = out
  }
  let audio = prev.audio
  if (has('audio')) {
    if (!Array.isArray(raw.audio) || raw.audio.length > MAX_AUDIO) return bad('audio', `En fazla ${MAX_AUDIO} ses`)
    const out: AudioItem[] = []
    for (const a of raw.audio) {
      const r = parseAudio(a, assets)
      if (!r.ok) return r
      out.push(r.value)
    }
    audio = out
  }
  const total = timeline(clips).total
  if (total > MAX_TOTAL_MS) return bad('clips', `Video en fazla 3 dakika olabilir (şu an ${Math.round(total / 1000)} sn)`)
  return {
    ok: true,
    value: {
      title: has('title') ? cleanText(raw.title, TITLE_MAX) || prev.title : prev.title,
      caption: has('caption') ? cleanText(raw.caption, CAPTION_MAX) : prev.caption,
      aspect: has('aspect') ? pick(raw.aspect, ASPECTS, prev.aspect) : prev.aspect,
      clips,
      texts,
      audio,
      // the closing card can be switched off only for a news item's own video
      closing: prev.newsVideo && has('closing') ? raw.closing !== false : prev.newsVideo ? prev.closing : true,
    },
  }
}

/** Why the project cannot be rendered yet (null = ready). */
export function renderProblem(p: Pick<EditProject, 'clips'>): string | null {
  if (!p.clips.length) return 'Zaman çizelgesine en az bir video ya da görsel ekleyin'
  const total = timeline(p.clips).total
  if (total < 1000) return 'Video en az 1 saniye olmalı'
  if (total > MAX_TOTAL_MS) return 'Video en fazla 3 dakika olabilir'
  return null
}

/** Deterministic key of everything that changes the output (FNV-1a, 12 hex). */
export function renderKeyFor(p: Pick<EditProject, 'aspect' | 'clips' | 'texts' | 'audio' | 'closing' | 'assets'>): string {
  const urls = new Map(p.assets.map((a) => [a.id, a.url]))
  const s = JSON.stringify(['kurgu1', p.aspect, p.closing, p.clips.map((c) => ({ ...c, url: urls.get(c.assetId) })), p.texts, p.audio.map((a) => ({ ...a, url: a.assetId ? urls.get(a.assetId) : null }))])
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x5bd1e995) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 12)
}

export const newItemId = (): string => {
  const a = new Uint8Array(5)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a)
  else for (let i = 0; i < 5; i++) a[i] = Math.floor(Math.random() * 256)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A fresh clip for an asset with CapCut-like defaults. */
export function defaultClip(asset: Pick<EditAsset, 'id' | 'kind' | 'durationMs'>, id = newItemId()): VideoClip {
  const out = asset.kind === 'image' ? IMAGE_DEFAULT_MS : Math.min(asset.durationMs ?? 10_000, MAX_TOTAL_MS)
  return { id, assetId: asset.id, inMs: 0, outMs: out, speed: 1, volume: 1, mute: false, crop: null, rotate: 0, flipH: false, scale: 1, posX: 0, posY: 0, fit: 'blur', brightness: 0, contrast: 1, saturation: 1, filter: 'none', transition: 'none', animIn: 'none', animOut: 'none' }
}
