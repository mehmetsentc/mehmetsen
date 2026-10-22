/**
 * REELS-4 — AI Reels editor: picks the story style and writes the spoken script.
 * Rules first (category → style); the LLM (Gemini fast) only writes the script in
 * the persona's style and may refine the style. Every LLM script is checked: every
 * number must exist in the source, length is bounded — otherwise the rule script is used.
 */
import type { ReelStyle } from './reelOptions'
import type { ReelPersona } from './personas'
import { buildVoiceText, speakable, VOICE_MAX_CHARS } from './timeline'

export type DirectorInput = {
  title: string
  summary: string
  categoryId: string
  categoryLabel: string
  breaking?: boolean
  postType?: string | null
  /** REELS-13: the article text (plain), so the anchor script covers the story, not only the headline. */
  body?: string
}

/**
 * REELS-13 — full news script: a newsreader's 40–60 s piece (≈ 14 characters per
 * second in Turkish). Facebook Reels must stay ≤ 90 s, so the hard ceiling leaves
 * room for the story video's own sound and the end card.
 */
export const NEWS_SCRIPT_MIN = 300
export const NEWS_SCRIPT_TARGET_MIN = 520
export const NEWS_SCRIPT_TARGET_MAX = 780
export const NEWS_SCRIPT_MAX = 860
/** Body text sent to the editor (characters). */
export const NEWS_BODY_MAX = 3500

export type DirectorResult = { style: ReelStyle; voiceText: string; source: 'ai' | 'rules'; note?: string }

const SPOR = /(spor|futbol|basketbol|voleybol|super-?lig|transfer|tenis|formula|motor)/
const MAGAZIN = /(magazin|eglence|eğlence|unlu|ünlü|dizi|sinema|kultur|kültür|sanat|muzik|müzik|yasam|yaşam)/
const ANALIZ = /(ekonomi|finans|borsa|piyasa|doviz|döviz|altin|altın|kripto|analiz|yorum|kose|köşe|yazar)/

export function styleByRules(i: Pick<DirectorInput, 'categoryId' | 'categoryLabel' | 'postType'>): ReelStyle {
  const k = `${i.categoryId} ${i.categoryLabel} ${i.postType ?? ''}`.toLocaleLowerCase('tr-TR')
  if (/(analysis|column|analiz|yorum)/.test(i.postType ?? '')) return 'analiz'
  if (SPOR.test(k)) return 'spor'
  if (MAGAZIN.test(k)) return 'magazin'
  if (ANALIZ.test(k)) return 'analiz'
  return 'haber'
}

const nums = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ''))

/** Script safety: numbers ⊆ source numbers, sane length, no emoji/hashtags/URLs. */
export function scriptProblem(script: string, source: string, maxChars = VOICE_MAX_CHARS + 20): string | null {
  const s = script.trim()
  if (s.length < 25) return 'too_short'
  if (s.length > maxChars) return 'too_long'
  if (/[#@]|https?:|\p{Extended_Pictographic}/u.test(s)) return 'bad_chars'
  const src = new Set(nums(source))
  for (const n of nums(s)) if (!src.has(n)) return `number_not_in_source:${n}`
  return null
}

export function directorPrompt(i: DirectorInput, persona: ReelPersona, oneSentence: boolean): { system: string; user: string } {
  return {
    system:
      'Sen NaHaber\'in Reels editörüsün. Haber videosu için kısa bir Türkçe seslendirme metni yazarsın. ' +
      'Kurallar: yalnızca verilen haberdeki bilgileri kullan, yeni bilgi/yorum/tahmin ekleme; iddiaları sahibine atfet; ' +
      'rakamları kaynakta yazıldığı gibi rakamla yaz (sesli okunuşa sistem çevirir); skorları "4-0" gibi yaz; emoji, etiket, link yok; ' +
      'KULAK İÇİN YAZ: kısa cümleler (en fazla 15-18 kelime), her cümlede tek bilgi; nefes yerlerine virgül koy; ' +
      'kısaltma, parantez, eğik çizgi, tırnak kullanma ("Dr." değil "Doktor", "vb." değil "ve benzeri"); ' +
      'en önemli bilgiyi cümlenin sonuna yerleştir (Türkçede vurgu yüklemden hemen öncedir); ünlem ve büyük harfle vurgu yok; ' +
      'özne ve yüklem net olsun, iç içe yan cümle kurma; kişi adını ilk geçtiği yerde unvanıyla söyle. ' +
      (oneSentence
        ? 'tek cümle, en fazla 120 karakter. '
        : 'PROFESYONEL HABER ANLATIMI: bir haber spikerinin 40-60 saniyelik anlatımı; ' +
          `${NEWS_SCRIPT_TARGET_MIN}-${NEWS_SCRIPT_TARGET_MAX} karakter, 5-7 cümle. Yapı: ` +
          '1) giriş: haberin özü tek cümlede (ne oldu, nerede); ' +
          '2) ayrıntılar: kim, ne zaman, nasıl, rakamlar ve somut bilgiler haber metninden; ' +
          '3) açıklamalar: yetkililerin ya da tarafların söyledikleri, sahibine atfederek; ' +
          '4) kapanış: son durum ya da beklenen gelişme (yalnızca haberde yazıyorsa); ' +
          'başlığı aynen tekrar etme, özetin cümlelerini kopyalama, kendi haber dilinle anlat; ' +
          'selamlama, "merhaba", "bu haberde", "detaylar linkte" gibi kalıplar kullanma. ') +
      `Sunucu: ${persona.name} (${persona.title}). Yazım tarzı: ${persona.writingStyle} ` +
      'Yanıtı yalnızca JSON ver: {"style":"haber|spor|magazin|analiz","script":"..."}',
    user:
      `Kategori: ${i.categoryLabel}\nBaşlık: ${i.title}\nÖzet: ${i.summary.slice(0, 900)}` +
      (!oneSentence && i.body?.trim() ? `\nHaber metni: ${i.body.replace(/\s+/g, ' ').trim().slice(0, NEWS_BODY_MAX)}` : ''),
  }
}

/** "4-0" → "4 0" (TTS reads «dört sıfır»), all-caps names → readable. */
export function spokenForm(script: string): string {
  return speakable(script.replace(/(\d+)\s*-\s*(\d+)/g, '$1 $2'))
}

export async function directReel(
  i: DirectorInput,
  persona: ReelPersona,
  llm: ((system: string, user: string) => Promise<string>) | null,
  opts: { oneSentence?: boolean } = {},
): Promise<DirectorResult> {
  const ruleStyle = i.breaking ? 'haber' : styleByRules(i)
  const fallbackText = opts.oneSentence ? buildVoiceText(i.title, '', 120) : buildNewsScript(i.title, i.summary, i.body ?? '')
  if (!llm) return { style: ruleStyle, voiceText: fallbackText, source: 'rules' }
  try {
    const p = directorPrompt(i, persona, !!opts.oneSentence)
    const raw = await llm(p.system, p.user)
    const j = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim()) as { style?: string; script?: string }
    const raw0 = typeof j.script === 'string' ? j.script.replace(/\s+/g, ' ').trim() : ''
    // A slightly long script is cut at the last whole sentence instead of being thrown away.
    const script = opts.oneSentence ? raw0 : trimToSentences(raw0, NEWS_SCRIPT_MAX)
    const source = `${i.title} ${i.summary} ${i.body ?? ''}`
    let problem = scriptProblem(script, source, opts.oneSentence ? 140 : NEWS_SCRIPT_MAX)
    // A story with real body text must get a real news piece, not a one-liner.
    if (!problem && !opts.oneSentence && (i.body ?? '').length >= 300 && script.length < NEWS_SCRIPT_MIN) problem = 'too_short_for_story'
    const style = (['haber', 'spor', 'magazin', 'analiz'] as const).find((s) => s === j.style) ?? ruleStyle
    if (problem) return { style: ruleStyle, voiceText: fallbackText, source: 'rules', note: problem }
    return { style: i.breaking ? 'haber' : style, voiceText: spokenForm(script), source: 'ai' }
  } catch (err) {
    return { style: ruleStyle, voiceText: fallbackText, source: 'rules', note: err instanceof Error ? err.message.slice(0, 80) : 'llm_error' }
  }
}

/**
 * Whole sentences of a text (trimmed, empty ones dropped). A sentence ends at . ! ? …
 * FOLLOWED BY A SPACE, so «1.200», «19.30» or «2.5» never split a sentence.
 */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…]["'»”’)\]]*)\s+(?=[^\s])/u)
    .map((x) => x.trim())
    .filter((x) => x.length > 1)
}

/** Longest prefix of whole sentences that fits in max characters (the text itself when it fits). */
export function trimToSentences(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  let out = ''
  for (const s of sentencesOf(t)) {
    const next = out ? `${out} ${s}` : s
    if (next.length > max) break
    out = next
  }
  return out || t.slice(0, max)
}

/**
 * REELS-13 rule script (no AI): headline, the summary and the opening sentences of
 * the article, whole sentences only, up to the target length. Never invents text.
 */
export function buildNewsScript(headline: string, summary: string, body: string, max = NEWS_SCRIPT_TARGET_MAX): string {
  const h = headline.replace(/\s+/g, ' ').trim().replace(/[.!?…]*$/, '.')
  const seen = new Set<string>()
  const key = (x: string) => x.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 60)
  const parts: string[] = [h]
  seen.add(key(h))
  for (const sent of [...sentencesOf(summary), ...sentencesOf(body)]) {
    if (sent.length < 25 || /https?:|@|#/.test(sent)) continue
    const k = key(sent)
    if (!k || seen.has(k)) continue
    const next = [...parts, sent].join(' ')
    if (next.length > max) break
    parts.push(sent)
    seen.add(k)
  }
  return speakable(parts.join(' '))
}
