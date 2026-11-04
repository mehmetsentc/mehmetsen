/**
 * REELS-T1 — NaHaber Reels şablonları (pure; safe for client, services and tests).
 *
 * A template = how the sound runs (audioMode) + how the words appear (textStyle) +
 * the theme music. Every template uses the same NaHaber brand (logo, navy, red, fonts);
 * only the storytelling changes, so different kinds of news get different reels.
 */
import type { ReelMusic, ReelStyle } from './reelOptions'

/**
 * - voice_then_video: the presenter tells the story, then the story's own video sound (≤ 12 s)
 * - video_then_voice: the video's original sound opens the reel, then it is turned down and the presenter tells the story
 * - video_only: no voice-over — the video's original sound only, the story on screen as text
 * - music_only: no voice-over — theme music under on-screen text (photos or muted video)
 */
export type ReelAudioMode = 'voice_then_video' | 'video_then_voice' | 'video_only' | 'music_only'
/** captions = the spoken sentence · typewriter = letters typed one by one · ticker = scrolling news band */
export type ReelTextStyle = 'captions' | 'typewriter' | 'ticker'

export type ReelTemplateId = 'klasik' | 'sahadan' | 'orijinal' | 'daktilo' | 'sondakika' | 'spor' | 'analiz'

export type ReelTemplate = {
  id: ReelTemplateId
  label: string
  description: string
  audioMode: ReelAudioMode
  textStyle: ReelTextStyle
  /** Theme music for this template ('auto' = by story style). */
  music: ReelMusic
  /** Needs a story video with real sound; otherwise it falls back (see fallbackTemplate). */
  needsVideoAudio: boolean
}

export const REEL_TEMPLATES: ReelTemplate[] = [
  {
    id: 'klasik',
    label: 'Klasik Anlatım',
    description: 'Spiker haberi anlatır, ardından haberin kendi videosu sesiyle oynar.',
    audioMode: 'voice_then_video',
    textStyle: 'captions',
    music: 'auto',
    needsVideoAudio: false,
  },
  {
    id: 'sahadan',
    label: 'Sahadan',
    description: 'Önce videonun orijinal sesi duyulur; sonra ses kısılır ve haber anlatılır.',
    audioMode: 'video_then_voice',
    textStyle: 'captions',
    music: 'none',
    needsVideoAudio: true,
  },
  {
    id: 'orijinal',
    label: 'Orijinal Ses',
    description: 'Seslendirme yok. Videonun kendi sesi; haber alt bantta kayan yazıyla.',
    audioMode: 'video_only',
    textStyle: 'ticker',
    music: 'none',
    needsVideoAudio: true,
  },
  {
    id: 'daktilo',
    label: 'Daktilo',
    description: 'Seslendirme yok. Müzik eşliğinde başlık ve özet daktilo gibi yazılır.',
    audioMode: 'music_only',
    textStyle: 'typewriter',
    music: 'sakin',
    needsVideoAudio: false,
  },
  {
    id: 'sondakika',
    label: 'Son Dakika',
    description: 'Hızlı anlatım, son dakika müziği ve alt bantta kayan son dakika yazısı.',
    audioMode: 'voice_then_video',
    textStyle: 'ticker',
    music: 'sondakika',
    needsVideoAudio: false,
  },
  {
    id: 'spor',
    label: 'Spor',
    description: 'Önce tribün / saha sesi, sonra enerjik müzikle anlatım.',
    audioMode: 'video_then_voice',
    textStyle: 'captions',
    music: 'enerjik',
    needsVideoAudio: true,
  },
  {
    id: 'analiz',
    label: 'Analiz',
    description: 'Sakin anlatım; cümleler daktilo gibi ekrana yazılır.',
    audioMode: 'voice_then_video',
    textStyle: 'typewriter',
    music: 'sakin',
    needsVideoAudio: false,
  },
]

const BY_ID = new Map(REEL_TEMPLATES.map((t) => [t.id, t]))

export function isReelTemplateId(v: unknown): v is ReelTemplateId {
  return typeof v === 'string' && BY_ID.has(v as ReelTemplateId)
}

export function reelTemplate(id: ReelTemplateId): ReelTemplate {
  return BY_ID.get(id)!
}

/** True when the template is made without a voice-over (no TTS is spent). */
export function templateHasVoice(t: Pick<ReelTemplate, 'audioMode'>): boolean {
  return t.audioMode === 'voice_then_video' || t.audioMode === 'video_then_voice'
}

/** «Otomatik»: the template the studio suggests for a story. */
export function recommendTemplate(s: { breaking?: boolean; style?: ReelStyle | null; hasVideo?: boolean }): ReelTemplateId {
  if (s.breaking) return 'sondakika'
  if (s.style === 'spor' && s.hasVideo) return 'spor'
  if (s.style === 'analiz') return 'analiz'
  if (s.hasVideo) return 'sahadan'
  return 'klasik'
}

/**
 * When the story has no video with audible sound, a template that needs it is made in
 * the nearest template that works — and the voice rule stays the same (a no-voice template
 * stays without voice-over).
 */
export function fallbackTemplate(id: ReelTemplateId): ReelTemplateId {
  if (id === 'sahadan' || id === 'spor') return 'klasik'
  if (id === 'orijinal') return 'daktilo'
  return id
}

/** Reading time for a no-voice reel: ~15 characters per second, 8–40 s. */
export function readingSeconds(text: string): number {
  const chars = text.replace(/\s+/g, ' ').trim().length
  return Math.max(8, Math.min(40, chars / 15 + 2))
}
