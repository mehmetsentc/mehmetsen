/**
 * REELS-1 — pure timing / text helpers for the news reel (no I/O).
 * Length follows the voice-over: intro sting → voice → short tail → end card.
 */

export const REEL_W = 1080
export const REEL_H = 1920
export const REEL_FPS = 30
/** Brand sting plays before the voice starts. */
export const INTRO_S = 0.75
/** Breath after the voice before the end card. */
export const TAIL_S = 0.35
export const END_CARD_S = 1.8
/** Typewriter speed for the headline (chars per second), as on the site. */
export const TYPE_CPS = 24
export const VOICE_MAX_CHARS = 220

export type ReelTimeline = {
  total: number
  frames: number
  voiceStart: number
  typeStart: number
  typeEnd: number
  summaryStart: number
  endStart: number
}

export function buildTimeline(voiceSeconds: number, headlineChars: number): ReelTimeline {
  const voice = Math.max(0, Number.isFinite(voiceSeconds) ? voiceSeconds : 0)
  const typeStart = INTRO_S
  const typeEnd = typeStart + Math.max(0, headlineChars) / TYPE_CPS
  const total = INTRO_S + voice + TAIL_S + END_CARD_S
  return {
    total,
    frames: Math.ceil(total * REEL_FPS),
    voiceStart: INTRO_S,
    typeStart,
    typeEnd,
    summaryStart: typeEnd + 0.15,
    endStart: total - END_CARD_S,
  }
}

export function ease(x: number): number {
  const t = Math.max(0, Math.min(1, x))
  return 1 - (1 - t) ** 3
}

/** All-caps words (≥3 letters) are read letter by letter by TTS — "GESTAŞ" → "Gestaş". */
export function speakable(text: string): string {
  return text.replace(/(?<!\p{L})([A-ZÇĞİÖŞÜ]{3,})(?!\p{L})/gu, (w) => w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR'))
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/)
  return (m ? m[1] : t).trim()
}

/** Voice-over: headline + one short summary sentence; never invents text. */
export function buildVoiceText(headline: string, summary: string, maxChars = VOICE_MAX_CHARS): string {
  const h = headline.replace(/\s+/g, ' ').trim().replace(/[.!?]*$/, '.')
  let s = firstSentence(summary || '')
  if (s && !/[.!?]$/.test(s)) s += '.'
  let out = s && !s.toLocaleLowerCase('tr-TR').startsWith(h.slice(0, 30).toLocaleLowerCase('tr-TR')) ? `${h} ${s}` : h
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(', '))
    out = end > h.length ? cut.slice(0, end + 1) : h
  }
  return speakable(out)
}

/** Click timestamps for typed (non-space) characters. */
export function clickTimes(typedText: string, typeStart: number, cps = TYPE_CPS): number[] {
  const out: number[] = []
  for (let i = 0; i < typedText.length; i++) {
    if (typedText[i]!.trim()) out.push(typeStart + i / cps)
  }
  return out
}

/** Greedy word wrap with a measuring function (canvas measureText). */
export function wrapLines(measure: (s: string) => number, text: string, width: number, maxLines = Infinity): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (measure(t) <= width || !cur) cur = t
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1]!.replace(/[\s,;:]*\S*$/, '') + '…'
    return kept
  }
  return lines
}
