/**
 * STORY-1 — «Konu → Video» (pure, browser-safe).
 *
 * A story project turns a topic (or a ready script) into a narrated vertical
 * video: the AI editor splits the narration into scenes, each scene shows one
 * of the editor's own uploads (photo / video) or, when nothing fits, an AI
 * illustration in the chosen style. Captions run word by word inside the
 * Reels / TikTok safe area.
 *
 * Timeline (seconds, one scene = one narrated sentence):
 *   segment i length  L_i = LEAD + voice_i + GAP + XF   (last: + TAIL)
 *   scene i starts at S_i = Σ_{j<i} (L_j − XF)          (xfade overlap XF)
 *   voice i starts at S_i + LEAD
 */
import { parseRights, PLATFORM_LIMITS, PLATFORM_NAME, type MediaRights, type MediaShareFormat, type MediaSharePlatform } from '../media/mediaProject'

export const STORY_PROJECTS = 'storyProjects'

export const MAX_ASSETS = 80
export const MAX_SCENES = 120
export const MIN_SCENES = 2
export const SCENE_TEXT_MAX = 260
export const TOPIC_MAX = 1200
export const SCRIPT_MAX = 12000
export const NEED_MAX = 200
export const TITLE_MAX = 120
export const CAPTION_MAX = 2000
export const PROMPT_MAX = 600
export const LABEL_MAX = 28
export const SERIES_MAX = 32
/** Facebook Reels publish limit is 90 s; keep a margin (1-minute videos). */
export const MAX_TOTAL_S = 88

/** Target lengths. Sections without the editor's own media get an AI illustration (budget-guarded) in every length. */
export const TARGET_MINUTES = [1, 3, 5, 10] as const
export type TargetMin = (typeof TARGET_MINUTES)[number]
export const isTargetMin = (v: unknown): v is TargetMin => typeof v === 'number' && (TARGET_MINUTES as readonly number[]).includes(v)
/** Upper bound of the rendered length per target (the AI aims at the target itself). */
export const MAX_SECONDS: Record<TargetMin, number> = { 1: MAX_TOTAL_S, 3: 240, 5: 380, 10: 720 }
// GÖREV 45: AI illustrations fill every section without an upload, in every length (monthly budget guards the cost).
export const allowsAiImages = (_p?: { targetMin?: TargetMin }) => true

export const STORY_FORMATS = ['vertical', 'horizontal'] as const
export type StoryFormat = (typeof STORY_FORMATS)[number]
export const isFormat = (v: unknown): v is StoryFormat => v === 'vertical' || v === 'horizontal'

/** Everything that depends on the frame: size, safe area, caption band, still size. */
export type Frame = {
  w: number
  h: number
  stillW: number
  stillH: number
  safe: { top: number; bottom: number; left: number; right: number }
  captionY: number
  capSize: number
  capLineH: number
  capChars: number
  pillY: number
  labelY: number
  labelSize: number
}

export const FRAMES: Record<StoryFormat, Frame> = {
  // Reels / TikTok / Shorts: header, right action column, bottom caption band are UI
  vertical: { w: 1080, h: 1920, stillW: 1188, stillH: 2112, safe: { top: 220, bottom: 1500, left: 100, right: 940 }, captionY: 1290, capSize: 58, capLineH: 74, capChars: 48, pillY: 236, labelY: 440, labelSize: 52 },
  // YouTube: classic lower-third subtitles, YouTube's own controls at the very bottom
  horizontal: { w: 1920, h: 1080, stillW: 2112, stillH: 1188, safe: { top: 60, bottom: 1000, left: 200, right: 1720 }, captionY: 905, capSize: 50, capLineH: 64, capChars: 64, pillY: 44, labelY: 170, labelSize: 46 },
}
export const frameOf = (p: { format?: StoryFormat }) => FRAMES[p.format ?? 'vertical']

export const LEAD = 0.15
export const GAP = 0.25
export const XF = 0.4
export const TAIL = 0.9
export const FPS = 30

export const STORY_STYLES = ['animasyon', 'paper', 'doodle', 'dark', 'photo'] as const
export type StoryStyle = (typeof STORY_STYLES)[number]

export type StyleTheme = {
  label: string
  hint: string
  /** Appended to every AI illustration prompt (English: image models follow it best). */
  imageStyle: string
  box: string
  text: string
  dim: string
  highlight: string
  pill: string
  pillText: string
  labelBg: string
  labelText: string
}

export const STYLE_THEME: Record<StoryStyle, StyleTheme> = {
  animasyon: {
    label: 'Bilgi animasyonu',
    hint: 'Hareketli büyük başlıklar, ses efektleri, müzik; düz vektör çizimler',
    imageStyle:
      'bold flat vector explainer illustration, clean geometric shapes, simple characters, vivid red, yellow and blue accents on a deep navy background, motion-graphics news style, high contrast, vertical 9:16 composition, no text, no letters, no logos',
    box: 'rgba(0,0,0,0)',
    text: '#FFFFFF',
    dim: 'rgba(255,255,255,0.55)',
    highlight: '#FFC400',
    pill: 'rgba(227,6,19,0.95)',
    pillText: '#FFFFFF',
    labelBg: '#E30613',
    labelText: '#FFFFFF',
  },
  paper: {
    label: 'Kâğıt dokulu tarih',
    hint: 'Eski kâğıt, mürekkep çizgi, sıcak toprak renkleri',
    imageStyle:
      'hand-drawn illustration on aged textured paper, ink outlines, muted earthy palette (ochre, sepia, teal), storybook history style, flat shading, vertical 9:16 composition, no text, no letters, no logos',
    box: 'rgba(30,24,18,0.78)',
    text: '#FAF6EC',
    dim: 'rgba(250,246,236,0.45)',
    highlight: '#F2B84B',
    pill: 'rgba(40,32,25,0.92)',
    pillText: '#F2B84B',
    labelBg: '#B4432F',
    labelText: '#F6EEDC',
  },
  doodle: {
    label: 'Çöp adam / el çizimi',
    hint: 'Basit çizgi karakterler, krem zemin, komik anlatım',
    imageStyle:
      'simple hand-drawn doodle cartoon, stick-figure style characters with round heads, thick black marker outlines, cream paper background, a few flat colors, humorous explainer style, vertical 9:16 composition, no text, no letters, no logos',
    box: 'rgba(20,20,20,0.0)',
    text: '#FFFFFF',
    dim: 'rgba(255,255,255,0.5)',
    highlight: '#FFC83D',
    pill: 'rgba(227,27,35,0.95)',
    pillText: '#FFFFFF',
    labelBg: '#FFD43B',
    labelText: '#1A1A1A',
  },
  dark: {
    label: 'Koyu bilgi grafiği',
    hint: 'Koyu zemin, parlak turuncu/mavi, kesit ve şema',
    imageStyle:
      'dark cinematic infographic illustration, deep navy and black background, glowing orange and cyan accents, clean 3D-like cutaway diagram style, high contrast, vertical 9:16 composition, no text, no letters, no logos',
    box: 'rgba(5,10,24,0.72)',
    text: '#FFFFFF',
    dim: 'rgba(255,255,255,0.45)',
    highlight: '#FFB020',
    pill: 'rgba(255,176,32,0.95)',
    pillText: '#0A0F1E',
    labelBg: '#0E1B33',
    labelText: '#FFB020',
  },
  photo: {
    label: 'Gerçekçi / belgesel',
    hint: 'Fotoğraf gerçekçiliğinde temsili sahneler',
    imageStyle:
      'documentary photo-realistic illustration, natural light, cinematic composition, vertical 9:16, no text, no letters, no logos, no identifiable real people',
    box: 'rgba(7,21,48,0.78)',
    text: '#FFFFFF',
    dim: 'rgba(255,255,255,0.45)',
    highlight: '#FFD166',
    pill: 'rgba(227,27,35,0.95)',
    pillText: '#FFFFFF',
    labelBg: '#071530',
    labelText: '#FFFFFF',
  },
}

export type AssetKind = 'image' | 'video'

export interface StoryAsset {
  id: string
  kind: AssetKind
  /** image: Firebase Storage path the editor uploaded; video: Video Kütüphanesi item id. */
  source: 'upload' | 'library'
  ref: string
  /** Preview URL for the studio (not used by the renderer). */
  previewUrl: string | null
  name: string
  durationMs: number | null
  /** AI description used to match the asset to a sentence. */
  description: string | null
  describeError: string | null
  addedAt: number
}

export type SceneVisual =
  | { kind: 'asset'; assetId: string; offsetMs: number }
  | { kind: 'ai'; prompt: string; imagePath: string | null; imageUrl: string | null; imageKey: string | null; error: string | null }
  /** Free NaHaber title card (style background + the scene's key words); used while a visual is missing. */
  | { kind: 'card' }

export interface StoryScene {
  id: string
  text: string
  highlights: string[]
  label: string | null
  visual: SceneVisual
  /** Keep the video's own sound under the narration (ducked). */
  keepAudio: boolean
  /** Why the AI picked this visual (shown in the timeline). */
  reason: string | null
  /** Shot list: what photo / video would fit here (Turkish, for the editor to upload). */
  need: string | null
  /** GÖREV 45 «Bilgi animasyonu»: big animated headline (2–5 words) and its small sub line. */
  headline?: string | null
  sub?: string | null
}

export type RenderState = {
  status: 'none' | 'ready' | 'failed'
  key: string | null
  outputUrl: string | null
  coverUrl: string | null
  seconds: number | null
  error: string | null
  renderedAt: number | null
}

/** GÖREV 45: background music (existing licensed beds in src/lib/reels/assets/audio/broadcast). */
export const STORY_MUSIC = ['none', 'sondakika', 'kurumsal', 'enerjik', 'modern', 'sakin', 'akustik', 'lofi'] as const
export type StoryMusic = (typeof STORY_MUSIC)[number]
export const MUSIC_LABEL: Record<StoryMusic, string> = { none: 'Müzik yok', sondakika: 'Son dakika', kurumsal: 'Kurumsal', enerjik: 'Enerjik', modern: 'Modern', sakin: 'Sakin', akustik: 'Akustik', lofi: 'Lo-fi' }
export const isMusic = (v: unknown): v is StoryMusic => typeof v === 'string' && (STORY_MUSIC as readonly string[]).includes(v)
export const HEADLINE_MAX = 40
export const SUB_MAX = 48

/** Narrator: a Google voice name (Chirp3-HD = professional) and speed; null = studio default (Reels → Sesler). */
export type StoryVoice = { name: string | null; rate: number | null }
const VOICE_NAME_RE = /^tr-TR-[A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,3}$/
export function parseVoice(v: unknown): StoryVoice {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const name = typeof r.name === 'string' && r.name.length <= 64 && VOICE_NAME_RE.test(r.name) ? r.name : null
  const n = Number(r.rate)
  const rate = r.rate == null || !Number.isFinite(n) ? null : Math.min(1.5, Math.max(0.75, Math.round(n * 100) / 100))
  return { name, rate }
}

export interface StoryProject {
  id: string
  format: StoryFormat
  targetMin: TargetMin
  title: string
  topic: string
  script: string
  caption: string
  style: StoryStyle
  seriesLabel: string
  rights: MediaRights
  /** GÖREV 45 */
  voice?: StoryVoice
  music?: StoryMusic
  /** sound effects on scene changes and headline pops */
  sfx?: boolean
  assets: StoryAsset[]
  scenes: StoryScene[]
  plannedAt: number | null
  render: RenderState
  createdBy: string
  createdAt: number
  updatedAt: number
}

export const EMPTY_RENDER: RenderState = { status: 'none', key: null, outputUrl: null, coverUrl: null, seconds: null, error: null, renderedAt: null }

// ── validation ───────────────────────────────────────────────────────────────

const PROJECT_ID_RE = /^st[a-f0-9]{16}$/
const SHORT_ID_RE = /^[a-z0-9]{4,16}$/
export const isStoryId = (v: unknown): v is string => typeof v === 'string' && PROJECT_ID_RE.test(v)
export const isShortId = (v: unknown): v is string => typeof v === 'string' && SHORT_ID_RE.test(v)

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max)
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string; message: string }
const bad = <T,>(field: string, message: string): Parsed<T> => ({ ok: false, field, message })

export const isStyle = (v: unknown): v is StoryStyle => typeof v === 'string' && (STORY_STYLES as readonly string[]).includes(v)

export type StoryMetaInput = { title: string; topic: string; script: string; caption: string; style: StoryStyle; seriesLabel: string; rights: MediaRights; format: StoryFormat; targetMin: TargetMin; voice: StoryVoice; music: StoryMusic; sfx: boolean }

export function parseMeta(raw: Record<string, unknown>, prev?: StoryProject): Parsed<StoryMetaInput> {
  const has = (k: string) => raw[k] !== undefined
  const topic = has('topic') ? cleanText(raw.topic, TOPIC_MAX) : prev?.topic ?? ''
  const script = has('script') ? cleanText(raw.script, SCRIPT_MAX) : prev?.script ?? ''
  if (!topic && !script) return bad('topic', 'Konu veya anlatım metni yazılmalı')
  let rights = prev?.rights
  if (has('rights') || !rights) {
    const r = parseRights(raw.rights)
    if (!r.ok) return bad(r.field, r.message)
    rights = r.value
  }
  const style = has('style') ? (isStyle(raw.style) ? raw.style : null) : prev?.style ?? 'paper'
  if (!style) return bad('style', 'Görsel stili geçersiz')
  const title = (has('title') ? cleanText(raw.title, TITLE_MAX) : prev?.title ?? '') || (topic || script).slice(0, 80)
  return {
    ok: true,
    value: {
      title,
      topic,
      script,
      caption: has('caption') ? cleanText(raw.caption, CAPTION_MAX) : prev?.caption ?? '',
      style,
      seriesLabel: (has('seriesLabel') ? cleanText(raw.seriesLabel, SERIES_MAX) : prev?.seriesLabel ?? '') || 'NaHaber',
      rights,
      format: has('format') && isFormat(raw.format) ? raw.format : prev?.format ?? 'vertical',
      targetMin: has('targetMin') && isTargetMin(raw.targetMin) ? raw.targetMin : prev?.targetMin ?? 1,
      voice: has('voice') ? parseVoice(raw.voice) : prev?.voice ?? { name: null, rate: null },
      music: has('music') && isMusic(raw.music) ? raw.music : prev?.music ?? (style === 'animasyon' ? 'sondakika' : 'none'),
      sfx: has('sfx') ? raw.sfx === true : prev?.sfx ?? style === 'animasyon',
    },
  }
}

function parseHighlights(v: unknown, text: string): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  const words = new Set(wordsOf(text).map(normWord))
  const out: string[] = []
  for (const h of list) {
    const w = cleanText(h, 40)
    if (!w) continue
    // a highlight may be a phrase; keep only words that are in the sentence
    for (const part of w.split(/\s+/)) if (words.has(normWord(part)) && !out.includes(part)) out.push(part)
    if (out.length >= 6) break
  }
  return out
}

/** One scene from client / AI input. Asset ids must exist; AI image fields are server-owned unless unchanged. */
export function parseScene(raw: unknown, assets: StoryAsset[], prev?: StoryScene): Parsed<StoryScene> {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!isShortId(s.id)) return bad('scenes.id', 'Sahne kimliği geçersiz')
  const text = cleanText(s.text, SCENE_TEXT_MAX)
  if (text.length < 2) return bad('scenes.text', 'Sahne metni boş olamaz')
  const v = (s.visual && typeof s.visual === 'object' ? s.visual : {}) as Record<string, unknown>
  let visual: SceneVisual
  if (v.kind === 'asset') {
    const asset = assets.find((a) => a.id === v.assetId)
    if (!asset) return bad('scenes.visual', 'Sahnedeki görüntü projede yok')
    const off = typeof v.offsetMs === 'number' && Number.isFinite(v.offsetMs) ? Math.max(0, Math.round(v.offsetMs)) : 0
    visual = { kind: 'asset', assetId: asset.id, offsetMs: asset.kind === 'video' ? (asset.durationMs ? Math.min(off, Math.max(0, asset.durationMs - 1000)) : off) : 0 }
  } else if (v.kind === 'card') {
    visual = { kind: 'card' }
  } else {
    const prompt = cleanText(v.prompt, PROMPT_MAX) || text
    const pv = prev?.visual.kind === 'ai' ? prev.visual : null
    // the generated image stays only while the prompt (and so its key) is unchanged
    const keep = pv && pv.prompt === prompt
    visual = { kind: 'ai', prompt, imagePath: keep ? pv.imagePath : null, imageUrl: keep ? pv.imageUrl : null, imageKey: keep ? pv.imageKey : null, error: keep ? pv.error : null }
  }
  const asset = visual.kind === 'asset' ? assets.find((a) => a.id === (visual as { assetId: string }).assetId) : undefined
  return {
    ok: true,
    value: {
      id: s.id,
      text,
      highlights: parseHighlights(s.highlights, text),
      label: cleanText(s.label, LABEL_MAX) || null,
      visual,
      keepAudio: asset?.kind === 'video' ? s.keepAudio === true : false,
      reason: cleanText(s.reason, 160) || null,
      need: cleanText(s.need, NEED_MAX) || null,
      headline: cleanText(s.headline, HEADLINE_MAX) || null,
      sub: cleanText(s.sub, SUB_MAX) || null,
    },
  }
}

export function parseScenes(raw: unknown, assets: StoryAsset[], prev: StoryScene[]): Parsed<StoryScene[]> {
  if (!Array.isArray(raw)) return bad('scenes', 'Sahne listesi geçersiz')
  if (raw.length > MAX_SCENES) return bad('scenes', `En fazla ${MAX_SCENES} sahne olabilir`)
  const out: StoryScene[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    const id = (r as { id?: unknown })?.id
    const p = parseScene(r, assets, prev.find((x) => x.id === id))
    if (!p.ok) return p
    if (seen.has(p.value.id)) return bad('scenes.id', 'Aynı sahne iki kez var')
    seen.add(p.value.id)
    out.push(p.value)
  }
  return { ok: true, value: out }
}

// ── text helpers ─────────────────────────────────────────────────────────────

export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/** Lower-case, Turkish-aware, without punctuation: «Çanakkale'de,» → «çanakkale'de». */
export function normWord(w: string): string {
  return w
    .replace(/^[«"“'(\[]+|[»"”')\].,;:!?…]+$/g, '')
    .toLocaleLowerCase('tr-TR')
}

/** Sentences of a script; keeps «1.200», «19.30», «Dr.» and initials together. */
export function splitSentences(text: string): string[] {
  const parts: string[] = []
  let cur = ''
  const t = text.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    cur += c
    if (c === '.' || c === '!' || c === '?' || c === '…') {
      const next = t[i + 1]
      const prevCh = t[i - 1] ?? ''
      const nextCh = t[i + 2] ?? ''
      if (c === '.' && /\d/.test(prevCh) && /\d/.test(next ?? '')) continue // 1.200 / 19.30
      if (next !== undefined && next !== ' ') continue
      const lastWord = cur.trim().split(' ').pop() ?? ''
      if (c === '.' && /^(Dr|Prof|Doç|Av|St|Mah|Cad|Sok|No|vb|vs|örn|Yrd|Uzm|Op)\.$/i.test(lastWord)) continue
      if (c === '.' && /^[A-ZÇĞİÖŞÜ]\.$/.test(lastWord) && /[A-ZÇĞİÖŞÜ]/.test(nextCh)) continue
      if (cur.trim()) parts.push(cur.trim())
      cur = ''
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

/** Split long sentences at commas/conjunctions so each scene stays short enough to read. */
export function scenesFromScript(script: string, maxLen = 150): string[] {
  const out: string[] = []
  for (const s of splitSentences(script)) {
    if (s.length <= maxLen) {
      out.push(s)
      continue
    }
    let rest = s
    while (rest.length > maxLen) {
      const cut = Math.max(rest.lastIndexOf(', ', maxLen), rest.lastIndexOf(' ve ', maxLen), rest.lastIndexOf(' ama ', maxLen))
      const at = cut > 40 ? cut + 1 : rest.lastIndexOf(' ', maxLen)
      out.push(rest.slice(0, at).trim())
      rest = rest.slice(at).trim()
    }
    if (rest) out.push(rest)
  }
  return out.filter((s) => s.length >= 2)
}

// ── AI plan ──────────────────────────────────────────────────────────────────

/** How many scenes / characters the AI should aim at for the target length. */
export function planBudget(targetMin: TargetMin): { scenes: [number, number]; chars: [number, number]; sceneChars: number } {
  const sec = targetMin * 60
  if (targetMin === 1) return { scenes: [6, 12], chars: [380, 820], sceneChars: 120 }
  // long-form: 1–2 sentences per scene (≈ 7–10 s), ≈ 13.5 characters per second of narration
  return { scenes: [Math.round(sec / 10), Math.round(sec / 6)], chars: [Math.round(sec * 12), Math.round(sec * 14)], sceneChars: 220 }
}

export function planSystemPrompt(p: { targetMin?: TargetMin; format?: StoryFormat; style?: StoryStyle } = {}): string {
  const t = p.targetMin ?? 1
  const b = planBudget(t)
  const long = t > 1
  const where = p.format === 'horizontal' ? 'yatay (16:9) YouTube videosu' : t === 1 ? 'kısa dikey video (Reels/TikTok/Shorts)' : 'dikey uzun video'
  return [
    `Sen NaHaber için ${where} hazırlayan Türkçe bir video editörüsün.`,
    'Görevin: anlatımı sahnelere bölmek ve her sahneye en uygun görüntüyü seçmek.',
    'Kurallar:',
    `- Hedef süre yaklaşık ${t} dakika: toplam ${b.chars[0]}–${b.chars[1]} karakter anlatım, ${b.scenes[0]}–${b.scenes[1]} sahne. Her sahne en fazla ${b.sceneChars} karakter (${long ? '1–2 cümle' : 'tek kısa cümle'}).`,
    long
      ? '- Uzun anlatım düzeni: güçlü bir giriş (merak sorusu), bölümler hâlinde gelişme (her bölüm bir alt başlık gibi akar), ara özetler ve net bir kapanış. Tekrara düşme; her sahne yeni bir bilgi versin.'
      : '- İlk sahne merak uyandıran bir soru ya da çarpıcı bir bilgi olsun. Son sahne net bir kapanış.',
    '- Anlatım metni verildiyse metni DEĞİŞTİRME, yalnızca sahnelere böl. Verilmediyse konudan doğru, kanıtlanmış bilgilerle yaz; uydurma rakam, tarih veya isim kullanma; emin olmadığın bilgiyi yazma.',
    '- Suç, cinayet, kaza gibi hassas konularda: masumiyet karinesine uy («şüpheli», «iddiaya göre»), çocuk ve mağdur kimliği verme, şiddeti ayrıntılı anlatma, kanlı sahne tarif etme.',
    '- Her sahne için 1–3 vurgu kelimesi seç (cümlede geçen kelimeler, aynen yazıldığı gibi).',
    '- Etiket yalnızca sahnedeki somut bir bilgi olabilir: yıl, yer adı, sayı veya kişi adı (ör. «1871», «Hisarlık», «9 katman»; en fazla 24 karakter). «Giriş», «Kapanış», «Teori», «Bulgular» gibi bölüm adları YAZMA; somut bilgi yoksa null.',
    long
      ? '- Görüntü seçimi: önce verilen görüntü listesini kullan (id ve açıklama). Bir görüntü birçok sahnede kullanılabilir; aynı videonun farklı anlarını (offsetSec) farklı sahnelere ver. Hiçbir görüntü cümleye uymuyorsa asset null olsun ve İngilizce bir çizim tarifi (prompt) yaz. Maliyet için: aynı bölümdeki ardışık sahnelerde AYNI prompt metnini aynen tekrar kullan (aynı çizim yeniden kullanılır); bütün videoda en fazla 12 farklı prompt olsun. Gerçek kişi yüzü, marka, logo ve yazı isteme.'
      : '- Görüntü seçimi: verilen görüntü listesinden (id ve açıklama) cümleye anlamca uyanı seç. Bir görüntü birden fazla sahnede kullanılabilir ama art arda değil. Uygun görüntü yoksa asset null olsun ve sahne için İngilizce bir çizim tarifi (prompt) yaz: ne görüneceğini somut anlat, gerçek kişi yüzü, marka, logo ve yazı isteme.',
    '- "need": bu sahneye en iyi uyacak görüntüyü editörün çekebileceği / bulabileceği biçimde Türkçe tarif et (ör. «Hisarlık tepesinin geniş açı fotoğrafı, gündüz», «kazı alanında çalışan arkeolog, yakın çekim video 5–10 sn»). Seçtiğin görüntü zaten çok iyi uyuyorsa null.',
    '- Video görüntüsünde cümleye en uygun anı offsetSec ile belirt (bilinmiyorsa 0).',
    ...(p.style === 'animasyon'
      ? ['- Her sahne için ekranda büyük harfle hareketli çıkacak bir başlık yaz ("headline", 2–5 kelime, en fazla 36 karakter, ör. «SAKIN KOŞMAYIN!», «ARAMA SÜRÜYOR», «112\'Yİ ARAYIN») ve isteğe bağlı kısa alt satır ("sub", en fazla 44 karakter, ör. «KAÇARSANIZ AV GİBİ GÖRÜNÜRSÜNÜZ»). Başlık cümlenin özünü verir; abartı, «ŞOK», «SKANDAL» yok.']
      : []),
    'Yalnızca JSON döndür: {"title": string, "caption": string, "scenes": [{"text": string, "highlights": string[], "label": string|null, ' + (p.style === 'animasyon' ? '"headline": string|null, "sub": string|null, ' : '') + '"asset": string|null, "offsetSec": number, "prompt": string|null, "need": string|null, "reason": string}]}',
    '"caption" sosyal medya açıklaması: 1–2 cümle + en fazla 4 hashtag.' + (p.format === 'horizontal' ? ' YouTube açıklaması olarak 3–5 cümlelik kısa özet de olabilir.' : ''),
  ].join('\n')
}

export function planUserPrompt(p: Pick<StoryProject, 'title' | 'topic' | 'script' | 'assets'> & { targetMin?: TargetMin }): string {
  const long = (p.targetMin ?? 1) > 1
  const assets = p.assets.length
    ? p.assets.map((a) => `- id: ${a.id} | ${a.kind === 'video' ? `video${a.durationMs ? ` ${Math.round(a.durationMs / 1000)} sn` : ''}` : 'fotoğraf'} | ${a.description ?? a.name}`).join('\n')
    : long
      ? '(henüz görüntü yok — asset null bırak; her sahne için çizim tarifi (prompt) ve "need" yaz)'
      : '(görüntü yok — bütün sahneler çizim olacak)'
  return [
    `Başlık: ${p.title || '-'}`,
    `Konu: ${p.topic || '-'}`,
    p.script ? `Anlatım metni (değiştirme, sahnelere böl):\n${p.script}` : 'Anlatım metni yok: konudan sen yaz.',
    `Görüntüler:\n${assets}`,
  ].join('\n\n')
}

type RawPlanScene = { text?: unknown; highlights?: unknown; label?: unknown; asset?: unknown; offsetSec?: unknown; prompt?: unknown; reason?: unknown; need?: unknown; headline?: unknown; sub?: unknown }

function extractJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(t)
  } catch {
    const a = t.indexOf('{')
    const b = t.lastIndexOf('}')
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/** Scene labels show facts (year, place, number); section names the AI sometimes invents are dropped. */
const META_LABEL = /^(giriş|kapanış|sonuç|teori|bulgular?|sorgulama|soru|merak|arka plan|tarih(sel)? (yer|süreç)|arkeoloji|özet|açılış|final|bilgi)$/i
export function factLabel(v: unknown): string | null {
  const l = cleanText(v, LABEL_MAX)
  if (!l || META_LABEL.test(l.toLocaleLowerCase('tr-TR'))) return null
  return l
}

export type PlanResult = { title: string | null; caption: string | null; scenes: StoryScene[]; source: 'ai' | 'fallback'; /** script the AI wrote (long videos) */ script?: string }

/**
 * AI answer → scenes. With a user script the AI must not rewrite it: when its
 * scene texts drift from the script, the script's own sentences are used and only
 * the AI's visual choices are kept (in order).
 */
export function parsePlan(raw: string | null, p: Pick<StoryProject, 'script' | 'topic' | 'assets'> & { targetMin?: TargetMin }, newId: () => string): PlanResult {
  const long = (p.targetMin ?? 1) > 1
  const maxLen = long ? 220 : 150
  const j = raw ? (extractJson(raw) as { title?: unknown; caption?: unknown; scenes?: unknown } | null) : null
  const rawScenes: RawPlanScene[] = j && Array.isArray(j.scenes) ? (j.scenes as RawPlanScene[]).slice(0, MAX_SCENES) : []
  let texts = rawScenes.map((s) => cleanText(s.text, SCENE_TEXT_MAX)).filter(Boolean)
  if (p.script) {
    const own = scenesFromScript(p.script, maxLen).slice(0, MAX_SCENES)
    const joined = (xs: string[]) => xs.join(' ').replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')
    if (joined(texts) !== joined(own)) texts = own
  }
  if (texts.length === 0) {
    // no usable AI answer and no script: one scene per topic sentence
    texts = scenesFromScript(p.topic, maxLen).slice(0, MAX_SCENES)
  }
  const scenes: StoryScene[] = texts.map((text, i) => {
    const r = rawScenes[i] ?? {}
    const asset = typeof r.asset === 'string' ? p.assets.find((a) => a.id === r.asset) : undefined
    const offsetMs = typeof r.offsetSec === 'number' && Number.isFinite(r.offsetSec) ? Math.max(0, Math.round(r.offsetSec * 1000)) : 0
    const prompt = cleanText(r.prompt, PROMPT_MAX) || text
    const visual: SceneVisual = asset
      ? { kind: 'asset', assetId: asset.id, offsetMs: asset.kind === 'video' && asset.durationMs ? Math.min(offsetMs, Math.max(0, asset.durationMs - 1000)) : 0 }
      : { kind: 'ai', prompt, imagePath: null, imageUrl: null, imageKey: null, error: null }
    return {
      id: newId(),
      text,
      highlights: parseHighlights(r.highlights, text),
      label: factLabel(r.label),
      visual,
      keepAudio: false,
      reason: cleanText(r.reason, 160) || null,
      need: cleanText(r.need, NEED_MAX) || (asset ? null : long ? 'Bu cümleyi anlatan bir fotoğraf ya da kısa video ekleyin' : null),
      headline: cleanText(r.headline, HEADLINE_MAX) || null,
      sub: cleanText(r.sub, SUB_MAX) || null,
    }
  })
  // AI gave no visual choices at all: place the uploads in order (long videos reuse them round-robin).
  if (rawScenes.length === 0 && p.assets.length) {
    scenes.forEach((s, k) => {
      if (!long && k >= p.assets.length) return
      const a = p.assets[k % p.assets.length]
      s.visual = { kind: 'asset', assetId: a.id, offsetMs: 0 }
      s.reason = 'Sırayla yerleştirildi (AI cevabı yoktu)'
      s.need = null
    })
  }
  return {
    title: j ? cleanText(j.title, TITLE_MAX) || null : null,
    caption: j ? cleanText(j.caption, CAPTION_MAX) || null : null,
    scenes,
    source: rawScenes.length ? 'ai' : 'fallback',
  }
}

/** Shot list: the scenes still waiting for a fitting photo / video, with the AI's description. */
export function shotList(p: Pick<StoryProject, 'scenes'>): Array<{ sceneId: string; index: number; need: string; text: string }> {
  return p.scenes
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.visual.kind !== 'asset' && !!s.need)
    .map(({ s, index }) => ({ sceneId: s.id, index, need: s.need!, text: s.text }))
}

// ── AI illustration ──────────────────────────────────────────────────────────

export function illustrationPrompt(scenePrompt: string, style: StoryStyle, format: StoryFormat = 'vertical'): string {
  const st = format === 'horizontal' ? STYLE_THEME[style].imageStyle.replace('vertical 9:16', 'horizontal 16:9') : STYLE_THEME[style].imageStyle
  return `${scenePrompt.trim()}. Style: ${st}. Full-bleed artwork that fills the entire frame edge to edge: no border, no frame, no margins, no blank paper areas. Main subject in the upper two thirds; the lower third continues the scene (ground, water, sky or texture) with fewer details so captions stay readable.`
}

/** FNV-1a 8 hex — stable key for files derived from the inputs. */
export function hashKey(parts: unknown[]): string {
  const s = JSON.stringify(parts)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export const imageKeyFor = (prompt: string, style: StoryStyle, format: StoryFormat = 'vertical') => hashKey(format === 'vertical' ? ['img', prompt, style, 'v1'] : ['img', prompt, style, format, 'v1'])

export function missingImages(p: Pick<StoryProject, 'scenes' | 'style'> & { format?: StoryFormat }): StoryScene[] {
  return p.scenes.filter((s) => s.visual.kind === 'ai' && (!s.visual.imagePath || s.visual.imageKey !== imageKeyFor(s.visual.prompt, p.style, p.format)))
}

/** Why the project cannot be rendered yet (null = ready). */
export function renderProblem(p: Pick<StoryProject, 'scenes' | 'style' | 'assets'> & { targetMin?: TargetMin; format?: StoryFormat }): string | null {
  const t = p.targetMin ?? 1
  if (p.scenes.length < MIN_SCENES) return `En az ${MIN_SCENES} sahne gerekli — önce sahneleri planlayın`
  // GÖREV 45: a section whose AI illustration is missing (budget, error) is rendered as a text card.
  for (const s of p.scenes) if (s.visual.kind === 'asset' && !p.assets.some((a) => a.id === (s.visual as { assetId: string }).assetId)) return 'Bir sahnenin görüntüsü silinmiş'
  const est = estimateSeconds(p.scenes)
  const max = MAX_SECONDS[t]
  if (est > max) return `Video yaklaşık ${Math.round(est)} sn olur; ${t} dakikalık hedefte en fazla ${max} sn (sahneleri kısaltın)`
  return null
}

export function renderKeyFor(p: Pick<StoryProject, 'scenes' | 'style' | 'seriesLabel' | 'rights' | 'assets'> & { format?: StoryFormat; voice?: StoryVoice; music?: StoryMusic; sfx?: boolean }): string {
  return hashKey([
    'story-v7',
    p.voice?.name ?? null,
    p.voice?.rate ?? null,
    p.music ?? 'none',
    p.sfx === true,
    p.format ?? 'vertical',
    p.style,
    p.seriesLabel,
    p.rights.kind,
    p.rights.sourceName,
    p.scenes.map((s) => [s.text, s.highlights, s.label, s.headline ?? null, s.sub ?? null, s.keepAudio, s.visual.kind === 'asset' ? [s.visual.assetId, s.visual.offsetMs, p.assets.find((a) => a.id === (s.visual as { assetId: string }).assetId)?.ref] : s.visual.kind === 'ai' && s.visual.imagePath && s.visual.imageKey === imageKeyFor(s.visual.prompt, p.style, p.format) ? [s.visual.imageKey] : ['card']]),
  ])
}

/**
 * Long videos are rendered in parts (each part one serverless job, run in parallel) and
 * joined without re-encoding. A part holds whole scenes, ≈ 60 s of video.
 */
export function chunkRanges(scenes: Pick<StoryScene, 'text'>[], targetSec = 60): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let start = 0
  let acc = 0
  scenes.forEach((s, i) => {
    acc += Math.max(1.2, [...s.text].length / 14.5) + LEAD + GAP
    if (acc >= targetSec && i < scenes.length - 1) {
      out.push([start, i + 1])
      start = i + 1
      acc = 0
    }
  })
  if (start < scenes.length) out.push([start, scenes.length])
  // a tiny last part (< 15 s) is merged into the previous one
  if (out.length > 1) {
    const [a, b] = out[out.length - 1]
    const tail = scenes.slice(a, b).reduce((x, s) => x + [...s.text].length / 14.5 + LEAD + GAP, 0)
    if (tail < 15) {
      out.pop()
      out[out.length - 1] = [out[out.length - 1][0], b]
    }
  }
  return out
}

// ── timeline ─────────────────────────────────────────────────────────────────

/** Turkish narration ≈ 14.5 characters per second at rate 1.05. */
export function estimateSeconds(scenes: Pick<StoryScene, 'text'>[]): number {
  if (!scenes.length) return 0
  const voice = scenes.map((s) => Math.max(1.2, [...s.text].length / 14.5))
  return segmentLengths(voice).reduce((a, b) => a + b, 0) - XF * (scenes.length - 1)
}

export function segmentLengths(voiceSec: number[]): number[] {
  return voiceSec.map((v, i) => LEAD + v + GAP + XF + (i === voiceSec.length - 1 ? TAIL - XF : 0))
}

export type TimedWord = { word: string; start: number; highlight: boolean }
export type CaptionChunk = { start: number; end: number; words: TimedWord[] }
export type TimedScene = { index: number; start: number; length: number; voiceStart: number; voiceSec: number; chunks: CaptionChunk[]; labelAt: number }
export type StoryTimeline = { scenes: TimedScene[]; total: number }

const wordWeight = (w: string) => [...w].length * (/\d/.test(w) ? 3 : 1) + 1

/** Caption chunks of at most ~2 lines (≈ 48 characters), words timed by spoken weight. */
export function captionChunks(text: string, highlights: string[], voiceStart: number, voiceSec: number, maxChars = 48): CaptionChunk[] {
  const words = wordsOf(text)
  const hl = new Set(highlights.map(normWord))
  const w = words.map(wordWeight)
  const total = w.reduce((a, b) => a + b, 0) || 1
  const span0 = voiceStart + 0.05
  const span = Math.max(0.3, voiceSec - 0.15)
  let acc = 0
  const timed: TimedWord[] = words.map((word, i) => {
    const t = { word, start: span0 + (span * acc) / total, highlight: hl.has(normWord(word)) }
    acc += w[i]
    return t
  })
  const chunks: CaptionChunk[] = []
  let cur: TimedWord[] = []
  let len = 0
  for (const tw of timed) {
    const add = [...tw.word].length + (cur.length ? 1 : 0)
    if (cur.length && len + add > maxChars) {
      chunks.push({ start: cur[0].start, end: tw.start, words: cur })
      cur = []
      len = 0
    }
    cur.push(tw)
    len += [...tw.word].length + (cur.length > 1 ? 1 : 0)
  }
  if (cur.length) chunks.push({ start: cur[0].start, end: voiceStart + voiceSec + GAP, words: cur })
  // the first chunk appears with the scene; each chunk stays until the next one
  if (chunks.length) chunks[0].start = Math.min(chunks[0].start, voiceStart - LEAD)
  return chunks
}

export function buildTimeline(scenes: Pick<StoryScene, 'text' | 'highlights'>[], voiceSec: number[], maxChars = 48): StoryTimeline {
  const lens = segmentLengths(voiceSec)
  let s = 0
  const out: TimedScene[] = scenes.map((sc, i) => {
    const start = s
    const voiceStart = start + LEAD
    s += lens[i] - XF
    const chunks = captionChunks(sc.text, sc.highlights, voiceStart, voiceSec[i], maxChars)
    // the last chunk of a scene stays until the next scene's transition ends
    if (chunks.length) chunks[chunks.length - 1].end = start + lens[i] - (i === scenes.length - 1 ? 0 : XF / 2)
    return { index: i, start, length: lens[i], voiceStart, voiceSec: voiceSec[i], chunks, labelAt: start + 0.35 }
  })
  const total = out.length ? out[out.length - 1].start + out[out.length - 1].length : 0
  return { scenes: out, total }
}

// ── sharing ──────────────────────────────────────────────────────────────────

export const storyLedgerKey = (id: string, renderKey: string) => `story_${id}_${renderKey}`.slice(0, 128)

export function storyCaption(p: Pick<StoryProject, 'caption' | 'title' | 'rights' | 'scenes' | 'assets'>): string {
  const body = p.caption.trim() || p.title.trim()
  const usesUploads = p.scenes.some((s) => s.visual.kind === 'asset')
  const usesAi = p.scenes.some((s) => s.visual.kind === 'ai')
  const src = usesUploads && p.rights.kind !== 'owned' && p.rights.sourceName ? `Kaynak: ${p.rights.sourceName}` : ''
  const ai = usesAi ? 'Görseller yapay zekâ ile üretilmiş temsili çizimlerdir.' : ''
  return [body, src, ai].filter(Boolean).join('\n\n').slice(0, 2200)
}

/** YouTube upload type: vertical ≤ 3 min goes up as a Short, everything else as a regular video. */
export function youtubeKind(p: Pick<StoryProject, 'format' | 'render'>): 'short' | 'video' {
  return (p.format ?? 'vertical') === 'vertical' && (p.render.seconds ?? 0) <= 180 ? 'short' : 'video'
}

/** Why the rendered video may not go to this platform / format (null = allowed). */
export function storyShareProblem(p: StoryProject, platform: MediaSharePlatform, format: MediaShareFormat): string | null {
  if (p.render.status !== 'ready' || !p.render.outputUrl || p.render.key !== renderKeyFor(p)) return 'Önce videoyu üretin (son değişiklikler videoda yok)'
  const sec = p.render.seconds ?? 0
  const foreign = p.rights.kind !== 'owned' && p.scenes.some((s) => s.visual.kind === 'asset')
  if (platform === 'youtube') {
    if (format === 'video_story') return 'YouTube video hikâyesi desteklemez'
    if (youtubeKind(p) === 'short' && sec > 60 && foreign) return 'YouTube: başkasına ait görüntü içeren Short 60 sn’yi geçmemeli'
    return null
  }
  if (p.format === 'horizontal') return `Yatay video yalnızca YouTube’a gider (${PLATFORM_NAME[platform]} dikey video ister)`
  const lim = PLATFORM_LIMITS[platform]
  if (format === 'video_story') {
    if (lim.storyMaxSec === null) return `${PLATFORM_NAME[platform]} video hikâyesi desteklemez`
    if (sec > lim.storyMaxSec) return `${PLATFORM_NAME[platform]} hikâyesi en fazla ${lim.storyMaxSec} sn`
    return null
  }
  if (sec > lim.reelMaxSec) return `${PLATFORM_NAME[platform]} için en fazla ${lim.reelMaxSec >= 120 ? `${lim.reelMaxSec / 60} dk` : `${lim.reelMaxSec} sn`}`
  return null
}

// ── long videos: script first, then visuals per numbered scene ─────────────────

/** Sections the long script is written in (models keep a section count far better than a length). */
export const longSections = (t: TargetMin) => ({ 1: 3, 3: 7, 5: 11, 10: 20 })[t]
export const SECTION_CHARS = 360

export function scriptSystemPrompt(t: TargetMin): string {
  const n = longSections(t)
  return [
    `Sen NaHaber için ${t} dakikalık anlatım videosu metni yazan Türkçe bir editörsün.`,
    `Metni TAM ${n} bölüm olarak yaz. Her bölüm ${SECTION_CHARS - 40}–${SECTION_CHARS + 40} karakter (4–6 cümle), kendi içinde tek bir alt konuyu anlatır.`,
    'İlk bölüm merak uyandıran bir giriş, son bölüm net bir kapanış olsun; aradaki bölümler kronolojik ya da mantıklı sırayla ilerlesin, tekrar etmesin.',
    'Doğru, kanıtlanmış bilgi kullan; uydurma rakam, tarih, isim yazma; emin olmadığını yazma. Tartışmalı konularda farklı görüşleri adil aktar.',
    'Suç, kaza gibi hassas konularda masumiyet karinesine uy, mağdur ve çocuk kimliği verme, şiddeti ayrıntılı anlatma.',
    'Cümleler seslendirilecek: kısa ve akıcı, kısaltma ve parantez kullanma, sayıları okunur yaz.',
    'Yalnızca JSON döndür: {"title": string, "sections": [{"heading": string, "text": string}]}',
  ].join('\n')
}

export function parseLongScript(raw: string | null): { title: string | null; sections: string[] } {
  const j = raw ? (extractJson(raw) as { title?: unknown; sections?: unknown } | null) : null
  const sections = j && Array.isArray(j.sections) ? (j.sections as Array<{ text?: unknown }>).map((s) => cleanText(s?.text, 1500)).filter((s) => s.length > 20) : []
  return { title: j ? cleanText(j.title, TITLE_MAX) || null : null, sections }
}

/** Visual choice for already-written, numbered scenes (long videos). */
export function visualsSystemPrompt(p: { format?: StoryFormat; style?: StoryStyle }): string {
  return [
    `Sen NaHaber için ${p.format === 'horizontal' ? 'yatay (16:9) YouTube' : 'dikey'} anlatım videosu hazırlayan Türkçe bir video editörüsün.`,
    'Sahnelerin metni hazır ve numaralı; metni DEĞİŞTİRME. Her sahne için:',
    '- "highlights": cümlede aynen geçen 1–3 vurgu kelimesi.',
    '- "label": yalnızca sahnedeki somut bilgi (yıl, yer, sayı, kişi adı; en fazla 24 karakter) ya da null. «Giriş», «Kapanış» gibi bölüm adları yazma.',
    '- "asset": verilen görüntü listesinden cümleye anlamca uyan id ya da null. Bir görüntü birçok sahnede kullanılabilir; aynı videonun farklı anlarını (offsetSec) kullan, art arda aynı fotoğrafı mümkünse koyma.',
    '- "prompt": asset null ise o sahne için İngilizce çizim tarifi (ne görüneceğini somut anlat; gerçek kişi yüzü, marka, logo, yazı isteme). Maliyet için aynı bölümdeki ardışık sahnelerde AYNI prompt metnini aynen tekrar kullan; bütün videoda en fazla 12 farklı prompt. asset seçildiyse null.',
    '- "need": asset null ise ya da daha iyi bir görüntü gerekiyorsa editörün çekebileceği / bulabileceği görüntüyü Türkçe somut tarif et (ör. «Hisarlık tepesinin geniş açı fotoğrafı, gündüz», «müzedeki seramik, yakın çekim»). İyi uyuyorsa null.',
    '- "reason": seçimin kısa gerekçesi.',
    ...(p.style === 'animasyon'
      ? ['- "headline": ekranda büyük harfle hareketli çıkacak 2–5 kelimelik başlık (en fazla 36 karakter, cümlenin özü; «ŞOK», «SKANDAL» yok). "sub": isteğe bağlı kısa alt satır (en fazla 44 karakter) ya da null.']
      : []),
    'Yalnızca JSON döndür: {"caption": string, "scenes": [{"i": number, "highlights": string[], "label": string|null, ' + (p.style === 'animasyon' ? '"headline": string|null, "sub": string|null, ' : '') + '"asset": string|null, "offsetSec": number, "prompt": string|null, "need": string|null, "reason": string}]}',
    '"caption": 1–2 cümle + en fazla 4 hashtag' + (p.format === 'horizontal' ? '; YouTube için 3–5 cümlelik özet de olabilir.' : '.'),
  ].join('\n')
}

export function visualsUserPrompt(texts: string[], p: Pick<StoryProject, 'title' | 'topic' | 'assets'>): string {
  const assets = p.assets.length
    ? p.assets.map((a) => `- id: ${a.id} | ${a.kind === 'video' ? `video${a.durationMs ? ` ${Math.round(a.durationMs / 1000)} sn` : ''}` : 'fotoğraf'} | ${a.description ?? a.name}`).join('\n')
    : '(henüz görüntü yok — asset null, her sahne için "need" yaz)'
  return [`Başlık: ${p.title || '-'}`, `Konu: ${p.topic || '-'}`, `Görüntüler:\n${assets}`, `Sahneler:\n${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`].join('\n\n')
}

/** Scenes from fixed texts + the AI's per-scene choices (matched by number, never by text). */
export function parseVisuals(raw: string | null, texts: string[], p: Pick<StoryProject, 'assets'>, newId: () => string): PlanResult {
  const j = raw ? (extractJson(raw) as { caption?: unknown; scenes?: unknown } | null) : null
  const rows = j && Array.isArray(j.scenes) ? (j.scenes as Array<RawPlanScene & { i?: unknown }>) : []
  const byIndex = new Map<number, RawPlanScene>()
  rows.forEach((r, k) => byIndex.set(typeof r?.i === 'number' ? r.i - 1 : k, r ?? {}))
  let rr = 0
  const scenes: StoryScene[] = texts.map((text, i) => {
    const r = byIndex.get(i) ?? {}
    let asset = typeof r.asset === 'string' ? p.assets.find((a) => a.id === r.asset) : undefined
    // no AI answer: spread the uploads over the scenes in order
    if (!rows.length && p.assets.length) asset = p.assets[rr++ % p.assets.length]
    const offsetMs = typeof r.offsetSec === 'number' && Number.isFinite(r.offsetSec) ? Math.max(0, Math.round(r.offsetSec * 1000)) : 0
    // GÖREV 45: a section without an upload gets the AI's illustration prompt (identical prompts share one image)
    const prompt = cleanText(r.prompt, PROMPT_MAX)
    return {
      id: newId(),
      text,
      highlights: parseHighlights(r.highlights, text),
      label: factLabel(r.label),
      visual: asset
        ? { kind: 'asset', assetId: asset.id, offsetMs: asset.kind === 'video' && asset.durationMs ? Math.min(offsetMs, Math.max(0, asset.durationMs - 1000)) : 0 }
        : prompt
          ? { kind: 'ai', prompt, imagePath: null, imageUrl: null, imageKey: null, error: null }
          : { kind: 'card' },
      keepAudio: false,
      reason: cleanText(r.reason, 160) || null,
      need: cleanText(r.need, NEED_MAX) || (asset ? null : 'Bu cümleyi anlatan bir fotoğraf ya da kısa video ekleyin'),
      headline: cleanText(r.headline, HEADLINE_MAX) || null,
      sub: cleanText(r.sub, SUB_MAX) || null,
    }
  })
  return { title: null, caption: j ? cleanText(j.caption, CAPTION_MAX) || null : null, scenes, source: rows.length ? 'ai' : 'fallback' }
}

/** Long scripts → scenes: one sentence each, very short neighbours joined (≈ 4–12 s per scene). */
export function longScenes(script: string): string[] {
  const out: string[] = []
  for (const s of scenesFromScript(script, 200)) {
    const last = out[out.length - 1]
    if (last && (last.length < 60 || s.length < 40) && last.length + s.length + 1 <= 170) out[out.length - 1] = `${last} ${s}`
    else out.push(s)
  }
  return out.slice(0, MAX_SCENES)
}

/** The big word of a text card: a highlight that is not the label, else the sentence's longest word. */
export function cardWord(s: Pick<StoryScene, 'text' | 'highlights' | 'label'>): string {
  const label = s.label ? normWord(s.label) : null
  const hl = s.highlights.find((h) => normWord(h) !== label && !(label && label.includes(normWord(h))))
  if (hl) return hl
  const words = wordsOf(s.text).map((w) => w.replace(/^[«"“'(\[]+|[»"”')\].,;:!?…]+$/g, '').replace(/['’](?:[a-zçğıöşü]{1,4})$/i, ''))
  const best = words.filter((w) => [...w].length >= 4 && normWord(w) !== label).sort((a, b) => [...b].length - [...a].length)[0]
  return best ?? words[0] ?? ''
}
