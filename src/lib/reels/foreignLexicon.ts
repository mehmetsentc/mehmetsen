import 'server-only'

/**
 * GENEL TELAFFUZ (26.11.2026) — seslendirmeden hemen önce metindeki YABANCI özel adları,
 * markaları ve kısaltmaları yapay zekâ bulur ve Türk spikerin okuyuşunu Türkçe harflerle
 * verir (BBC → Bi Bi Si, Phu Quoc → Fu Kuok). Yalnızca ses değişir; ekran yazısı aynı kalır.
 * Yapay zekâ yoksa / geç kalırsa sabit kurallar (ttsNormalize) devam eder.
 * Maliyet: seslendirme başına tek kısa Gemini Flash çağrısı; aynı metin bellekte önbelleklenir.
 */
import { geminiFastChat } from '@/lib/ai/providers/geminiChat'
import { getGeminiApiKey } from '@/lib/ai/router/policy'
import { sanitizeLexicon, toSpokenTurkish, type SpokenLexicon } from './ttsNormalize'

const SYSTEM = `Türkçe haber seslendirmesi için telaffuz sözlüğü hazırlıyorsun.
Metindeki YABANCI özel adları (kişi, şehir, ülke, kurum, şirket, marka, medya kuruluşu, spor kulübü) ve YABANCI kısaltmaları bul.
Her biri için Türk haber spikerinin söylediği okunuşu YALNIZCA Türkçe harflerle yaz; Türkçe bir ses bunu harf harf okuyunca doğru duyulsun.
Örnekler: BBC → Bi Bi Si; CNN → Si En En; FBI → Ef Bi Ay; Phu Quoc → Fu Kuok; Washington → Vaşington; Reuters → Roytırs; Elon Musk → İlon Mask; Donald Trump → Donald Tramp; Chelsea → Çelsi; Google → Gugıl; Shakespeare → Şekspir.
Kurallar:
- Türkçe adları, Türkiye'deki yerleri ve Türkiye kısaltmalarını (CHP, AKP, TBMM, ABD, AB, MİT, TÜİK, AFAD, THY…) EKLEME.
- Türkçe yazıldığı gibi okununca zaten doğru duyulan adları (Putin, Paris, Berlin, Biden, Madrid) EKLEME.
- Anahtarı metinde yazıldığı gibi, Türkçe eki olmadan ver ("BBC'nin" → "BBC").
- Çeviri yapma, yalnızca okunuş.
- Yalnızca JSON: {"items":[{"w":"BBC","s":"Bi Bi Si"}]}. Yabancı ad yoksa {"items":[]}.`

const cache = new Map<string, SpokenLexicon>()

/** Bir aday var mı? (büyük harfli sözcük / kısaltma, Türkçede olmayan harf öbeği) */
function hasCandidates(text: string): boolean {
  return /\p{Lu}[\p{L}]*/u.test(text) && (/[qwxQWX]|ph|sh|th|ck|oo|ee|ou|gh|ea|ae|tz|\b[A-Z]{2,}\b/.test(text) || /\p{Lu}\p{Ll}+/u.test(text))
}

export async function foreignLexicon(text: string): Promise<SpokenLexicon | null> {
  if ((process.env.TTS_FOREIGN_LEXICON ?? 'on').toLowerCase() === 'off') return null
  if (!getGeminiApiKey() || !hasCandidates(text)) return null
  const key = text.slice(0, 4000)
  const hit = cache.get(key)
  if (hit) return hit
  try {
    const r = await geminiFastChat({
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: key }],
      temperature: 0,
      maxTokens: 600,
      timeoutMs: 8_000,
      jsonMode: true,
      skipTelemetry: true,
    })
    const lex = sanitizeLexicon(JSON.parse(r.text.replace(/^```(?:json)?|```$/g, '').trim()), key)
    if (cache.size > 300) cache.delete(cache.keys().next().value!)
    cache.set(key, lex)
    return lex
  } catch (err) {
    console.warn('[tts] yabancı ad sözlüğü alınamadı, sabit kurallar:', err instanceof Error ? err.message.slice(0, 100) : err)
    return null
  }
}

/** Seslendirme metni: yapay zekâ telaffuz sözlüğü + sabit Türkçe okunuş kuralları. */
export async function spokenTurkish(text: string): Promise<string> {
  return toSpokenTurkish(text, await foreignLexicon(text))
}
