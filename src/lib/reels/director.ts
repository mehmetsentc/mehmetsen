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
}

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
      (oneSentence ? 'tek cümle, en fazla 120 karakter. ' : `en fazla ${VOICE_MAX_CHARS} karakter, 1-2 cümle. `) +
      `Sunucu: ${persona.name} (${persona.title}). Yazım tarzı: ${persona.writingStyle} ` +
      'Yanıtı yalnızca JSON ver: {"style":"haber|spor|magazin|analiz","script":"..."}',
    user: `Kategori: ${i.categoryLabel}\nBaşlık: ${i.title}\nÖzet: ${i.summary.slice(0, 900)}`,
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
  const fallbackText = opts.oneSentence ? buildVoiceText(i.title, '', 120) : buildVoiceText(i.title, i.summary)
  if (!llm) return { style: ruleStyle, voiceText: fallbackText, source: 'rules' }
  try {
    const p = directorPrompt(i, persona, !!opts.oneSentence)
    const raw = await llm(p.system, p.user)
    const j = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim()) as { style?: string; script?: string }
    const script = typeof j.script === 'string' ? j.script.replace(/\s+/g, ' ').trim() : ''
    const problem = scriptProblem(script, `${i.title} ${i.summary}`, opts.oneSentence ? 140 : VOICE_MAX_CHARS + 20)
    const style = (['haber', 'spor', 'magazin', 'analiz'] as const).find((s) => s === j.style) ?? ruleStyle
    if (problem) return { style: ruleStyle, voiceText: fallbackText, source: 'rules', note: problem }
    return { style: i.breaking ? 'haber' : style, voiceText: spokenForm(script), source: 'ai' }
  } catch (err) {
    return { style: ruleStyle, voiceText: fallbackText, source: 'rules', note: err instanceof Error ? err.message.slice(0, 80) : 'llm_error' }
  }
}
