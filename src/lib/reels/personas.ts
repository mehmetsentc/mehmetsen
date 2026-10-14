/**
 * REELS-4 — presenter personas (pure, no I/O). A persona = name + on-screen title +
 * Google voice + rate + writing style for the AI editor; optionally a Gemini-TTS
 * style prompt (paid, budget-capped) and a photo URL for the presenter card.
 */
import type { ReelStyle } from './reelOptions'
import { clampRate, isValidVoiceName } from './voiceRules'

export type ReelPersona = {
  id: string
  name: string
  title: string
  /** Story styles this persona presents by default. */
  styles: ReelStyle[]
  voice: string
  rate: number
  /** How the AI editor writes for this persona (tone, sentence length, opening). */
  writingStyle: string
  /** Gemini-TTS: speaking-style prompt and voice (used only when Gemini is enabled). */
  geminiStyle: string
  geminiVoice: string
  useGemini: boolean
  photoUrl: string | null
  showCard: boolean
}

export const DEFAULT_PERSONAS: ReelPersona[] = [
  {
    id: 'ece', name: 'Ece', title: 'Gündem sunucusu', styles: ['haber'], voice: 'tr-TR-Standard-D', rate: 1.05,
    writingStyle: 'Ciddi ve net haber spikeri dili. Kısa cümleler, önce en önemli bilgi. Abartı yok.',
    geminiStyle: 'Bir haber spikeri gibi ciddi, net ve güven veren bir tonla oku; cümle sonlarında kısa duraklamalar yap.',
    geminiVoice: 'Kore', useGemini: false, photoUrl: null, showCard: true,
  },
  {
    id: 'kerem', name: 'Kerem', title: 'Spor sunucusu', styles: ['spor'], voice: 'tr-TR-Wavenet-E', rate: 1.12,
    writingStyle: 'Enerjik spor spikeri dili. Skoru ve yıldız oyuncuyu öne çıkar, heyecanlı ama doğru.',
    geminiStyle: 'Heyecanlı bir spor spikeri gibi enerjik ve canlı oku; skorları vurgula.',
    geminiVoice: 'Puck', useGemini: false, photoUrl: null, showCard: true,
  },
  {
    id: 'selin', name: 'Selin', title: 'Magazin sunucusu', styles: ['magazin'], voice: 'tr-TR-Wavenet-C', rate: 1.06,
    writingStyle: 'Samimi ve sıcak magazin dili; dedikodu ve yorum yok, yalnızca haberdeki bilgi.',
    geminiStyle: 'Samimi, sıcak ve gülümseyen bir tonla oku.',
    geminiVoice: 'Leda', useGemini: false, photoUrl: null, showCard: true,
  },
  {
    id: 'deniz', name: 'Deniz', title: 'Ekonomi ve analiz', styles: ['analiz'], voice: 'tr-TR-Chirp3-HD-Charon', rate: 0.98,
    writingStyle: 'Ağırbaşlı, açıklayıcı analiz dili. Rakamları doğal oku, kimin söylediğini belirt.',
    geminiStyle: 'Ağırbaşlı bir ekonomi yorumcusu gibi sakin ve açıklayıcı oku; rakamları net söyle.',
    geminiVoice: 'Charon', useGemini: false, photoUrl: null, showCard: true,
  },
]

const ID_RE = /^[a-z0-9-]{2,24}$/
const STYLES: ReelStyle[] = ['haber', 'spor', 'magazin', 'analiz']
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export function parsePersona(raw: unknown): ReelPersona | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!r) return null
  const id = str(r.id, 24).toLowerCase()
  const name = str(r.name, 32)
  if (!ID_RE.test(id) || !name || !isValidVoiceName(r.voice)) return null
  const styles = Array.isArray(r.styles) ? (r.styles.filter((s) => STYLES.includes(s as ReelStyle)) as ReelStyle[]) : []
  const photo = str(r.photoUrl, 500)
  return {
    id,
    name,
    title: str(r.title, 48),
    styles: [...new Set(styles)],
    voice: r.voice,
    rate: clampRate(r.rate) ?? 1.05,
    writingStyle: str(r.writingStyle, 400),
    geminiStyle: str(r.geminiStyle, 400),
    geminiVoice: /^[A-Za-z]{2,20}$/.test(str(r.geminiVoice, 20)) ? str(r.geminiVoice, 20) : 'Kore',
    useGemini: r.useGemini === true,
    photoUrl: /^https:\/\//.test(photo) ? photo : null,
    showCard: r.showCard !== false,
  }
}

export function parsePersonas(raw: unknown): ReelPersona[] {
  const list = Array.isArray(raw) ? raw.map(parsePersona).filter((p): p is ReelPersona => !!p) : []
  const seen = new Set<string>()
  const out = list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 12)
  return out.length ? out : DEFAULT_PERSONAS
}

/** Persona for a story style: explicit id > first persona that presents the style > first persona. */
export function personaFor(list: ReelPersona[], style: ReelStyle, id?: string | null): ReelPersona {
  const all = list.length ? list : DEFAULT_PERSONAS
  return (id ? all.find((p) => p.id === id) : undefined) ?? all.find((p) => p.styles.includes(style)) ?? all[0]!
}
