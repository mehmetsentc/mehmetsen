/**
 * AI Social Media Editor
 *
 * Gemini / DeepSeek ile haber için sosyal medya içeriği üretir:
 *   - headline: Story/OG görseline — 1 satır veya 2–3 vurucu satır gazete manşeti (max 52)
 *   - storySummary: Manşet altı: tam faydalı özet (ne oldu + etki), TAM cümle (max 170)
 *   - caption:  FB/IG POST açıklaması — tam manşet anlamı + tam kısa özet (URL yok)
 *   - hashtags: 5 ilgili Türkçe hashtag
 *   - altText:  SEO uyumlu görsel alt metni
 *
 * Gemini API: REST (SDK yok)
 * Env: GEMINI_API_KEY, GEMINI_MODEL (default: gemini-2.5-flash)
 */

import { clampAtWordBoundary, clampCompleteSentences } from './feedCaption'

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1/chat/completions'

/** Kısa tut: OG'de 1 satır veya doğal 2–3 satır; 4+ satır sarkan cümlelerden kaçın */
const HEADLINE_MAX = 52
/** Tam özet için biraz daha alan; lacivert panel sığacak şekilde */
const STORY_SUMMARY_MAX = 170
/** Post caption gövdesi — cümle ortasından kesilmez; URL/hashtag publisher ekler */
const CAPTION_MAX = 900

/** Meta CTA / "habere git" kalıpları — özet metninden temizlenir */
const META_CTA_RE =
  /\b(detaylar(?:ı|ın)?\s+(?:için\s+)?(?:haberimizde|tıklayın|tıkla)|haberimizde|haberin\s+devamı|devamı\s+için|devamını\s+oku|tıklayın|tıkla(?:yın)?|linkten\s+oku|okumak\s+için|haberi\s+oku|ayrıntılar(?:\s+için)?|işte\s+detaylar|detaylar\s+için)\b/giu

export interface AISocialContent {
  headline: string
  /** Hikaye OG görselinde manşetin altındaki tam faydalı özet (tam cümleler) */
  storySummary: string
  caption: string
  hashtags: string[]
  altText: string
}

const SYSTEM_PROMPT = `Sen NaHaber'in Sosyal Medya Editörüsün.
Türkçe haberlerden Instagram ve Facebook (özellikle HİKAYE / story görseli) için profesyonel içerik üretiyorsun.
Ton: ciddi haber odası / gazete manşeti — net, güçlü, abartısız.

KURALLAR:
- headline: Gazete ciddiyetiyle dikkat çeken TÜRKÇE manşet (max ${HEADLINE_MAX} karakter). Etkili olsun.
  * UZUNLUK / SATIR: Ya TEK SATIRDA sığacak kadar kısa ve vurucu OL, YA DA 2–3 tematik satır için satır sonlarını \\n ile belirt (ör. "Çanakkale enflasyonunda\\nsürpriz düşüş"). Her satır kısa vurucu öbek olsun. Uzun sarkan tek cümle YASAK — 4+ satıra rastgele sarılmasın. Max 3 satır.
  * Curiosity gap OK (beklenmedik açı, gerilim, çarpıcı rakam); ucuz clickbait / sahte vaat YASAK.
  * TAM kelimeler; yarım cümle / kesik kelime YASAK. Nokta ile bitirme (gazete manşeti gibi).
- storySummary: Manşetin ALTINDA görünecek TAM FAYDALI ÖZET. 1 veya 2 TAM cümle; toplam max ${STORY_SUMMARY_MAX} karakter. Her cümle nokta, ünlem veya soru işareti ile bitsin. Asla cümleyi veya kelimeyi ortadan kesme.
  * 1. görev — ANLAŞILIRLIK: Ne olduğu net olsun (kim/ne/nerede + ana olay). Okuyucu özetten haberi anlamalı; teaser / "ipuucu verip sakla" YASAK.
  * 2. görev — DERİNLİK İŞTAHI: Merak, maddi etki / kim etkileniyor / ne değişiyor / çarpıcı sonuç gibi ÖZ ile gelsin — "git oku" demeden. Tıklama, link stiker / bağlantı UI üzerinden olur; metinde CTA yok.
  * YASAK meta CTA kalıpları (özetten ASLA kullanma): "haberimizde", "detayları haberimizde", "detaylar için", "devamı için", "devamını oku", "tıklayın", "tıkla", "linkten", "haberi oku", "ayrıntılar", "işte detaylar" vb.
  * Sade, akıcı Türkçe; jargon ve abartı yok.
- caption: Facebook/Instagram POST açıklama gövdesi (URL ve hashtag YOK — sistem ekler).
  * İçerik: (1) Haberin TAM manşetini yansıtan açılış cümlesi/paragrafı — manşet anlamı eksik/yarım kalmasın.
    (2) TAM kısa özet: ne oldu + önemli detay/etki — okunabilir 2–3 paragraf.
  * Toplam ~400–800 karakter. 1. paragraf emoji ile başlasın. Paragraflar arasında boş satır (\\n\\n).
  * YALNIZCA tamamlanmış cümleler; yarım cümle, kesik kelime, "…" ile biten teaser YASAK.
  * URL / "linkten okuyun" / "haberimizde" ekleme.
- hashtags: TAM OLARAK 5 adet, Türkçe, #ile başlayan, haber konusuyla ilgili
- altText: SEO uyumlu, haber ne anlattığını açıklayan, 10-20 kelime
- ÇIKTI: Yalnızca geçerli JSON, başka hiçbir şey ekleme`

function buildPrompt(title: string, description: string, cityName: string): string {
  return `Aşağıdaki haber için sosyal medya + hikaye görseli içeriği oluştur:

BAŞLIK: ${title}
HABERİN İÇERİĞİ: ${description.slice(0, 1500)}
ŞEHİR: ${cityName}

JSON şeması:
{
  "headline": "string (max ${HEADLINE_MAX} karakter: tek satır VEYA 2-3 satır \\n ile; sarkan uzun cümle yok; nokta yok)",
  "storySummary": "string (1-2 tam cümle, max ${STORY_SUMMARY_MAX} karakter: ne oldu + etki/sonuç net; meta CTA YASAK — haberimizde/tıkla/devamı yok; noktalama ile bitsin)",
  "caption": "string (2-3 paragraf: tam manşet anlamı + tam kısa özet; 400-800 karakter; emoji ile başlar; \\n\\n; URL yok; yarım cümle yok)",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "altText": "string (10-20 kelime, SEO açıklaması)"
}`
}

function stripMetaCtas(s: string): string {
  return s
    .replace(META_CTA_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.!?])/g, '$1')
    .replace(/^[.\s,;:—–-]+/, '')
    .trim()
}

/** Manşet: isteğe bağlı \\n ile 1–3 tematik satır; karakter limiti satırlar toplamında. */
function clampHeadline(s: string, max: number): string {
  const lines = s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
  if (lines.length === 0) return ''
  if (lines.length === 1) return clampAtWordBoundary(lines[0], max)
  // Çok satır: toplam max'ı satırlara orantılı dağıt; aşarsa son satırdan kısalt
  let joined = lines.join('\n')
  if (joined.replace(/\n/g, '').length <= max && joined.length <= max + lines.length - 1) {
    return joined
  }
  const budget = max
  const out: string[] = []
  let used = 0
  for (let i = 0; i < lines.length; i++) {
    const remainingLines = lines.length - i
    const remain = budget - used
    const share = Math.max(8, Math.floor(remain / remainingLines))
    const part = clampAtWordBoundary(lines[i], share)
    if (!part) continue
    out.push(part)
    used += part.length
    if (used >= budget) break
  }
  return out.join('\n')
}

/** Caption gövdesi: paragraf yapısını koru; aşırı uzunsa cümle sınırında kısalt. */
function clampCaptionBody(s: string, max: number): string {
  const normalized = s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (normalized.length <= max) return normalized
  // Paragrafları tek tek biriktir; yarım paragraf ekleme
  const paras = normalized.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  const kept: string[] = []
  let used = 0
  for (const p of paras) {
    const next = kept.length === 0 ? p : `\n\n${p}`
    if (used + next.length <= max) {
      kept.push(p)
      used += next.length
      continue
    }
    const remain = max - used - (kept.length ? 2 : 0)
    if (remain >= 60) {
      const partial = clampCompleteSentences(p, remain)
      if (partial) kept.push(partial)
    }
    break
  }
  return kept.join('\n\n') || clampCompleteSentences(normalized.replace(/\n+/g, ' '), max)
}

function fallbackStorySummary(title: string, caption: string): string {
  const fromCaption = stripMetaCtas(
    caption
      .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '')
      .split(/\n+/)[0]
      ?.trim() || ''
  )
  const base = fromCaption.length >= 40 ? fromCaption : title
  const clamped = clampCompleteSentences(stripMetaCtas(base), STORY_SUMMARY_MAX)
  if (/[.!?]$/.test(clamped)) return clamped
  // Tek satır başlıktan özet üretilemediyse noktalı kısa cümle
  return clampAtWordBoundary(`${clamped.replace(/[.!?…]+$/, '')}.`, STORY_SUMMARY_MAX)
}

function parseAISocialJSON(raw: string, title: string): AISocialContent | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const p = JSON.parse(cleaned) as Partial<AISocialContent>
    const str = (v: unknown, fallback: string): string =>
      typeof v === 'string' && v.trim() ? v.trim() : fallback
    const tags: string[] = Array.isArray(p.hashtags)
      ? p.hashtags.map((t) => { const s = String(t).trim(); return s.startsWith('#') ? s : `#${s}` }).slice(0, 5)
      : ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye']
    while (tags.length < 5) tags.push('#NaHaber')
    const caption = clampCaptionBody(str(p.caption, `📰 ${title}`), CAPTION_MAX)
    const headline = clampHeadline(str(p.headline, title), HEADLINE_MAX)
    const storySummary = clampCompleteSentences(
      stripMetaCtas(str(p.storySummary, fallbackStorySummary(title, caption))),
      STORY_SUMMARY_MAX
    )
    return {
      headline,
      storySummary,
      caption,
      hashtags: tags,
      altText:  clampAtWordBoundary(str(p.altText, title), 200),
    }
  } catch {
    return null
  }
}

async function generateWithGemini(
  title: string, description: string, cityName: string
): Promise<AISocialContent | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(title, description, cityName) }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.4, topP: 0.85, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[aiSocialEditor] Gemini HTTP ${res.status}: ${err.slice(0, 200)}`)
      return null
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      error?: { message?: string }
    }
    if (data.error) { console.error('[aiSocialEditor] Gemini error:', data.error.message); return null }
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!raw) return null
    return parseAISocialJSON(raw, title)
  } catch (err) {
    console.error('[aiSocialEditor] Gemini exception:', err)
    return null
  }
}

async function generateWithDeepSeek(
  title: string, description: string, cityName: string
): Promise<AISocialContent | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  try {
    const res = await fetch(DEEPSEEK_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_NEWS_MODEL || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(title, description, cityName) },
        ],
        temperature: 0.4,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error(`[aiSocialEditor] DeepSeek HTTP ${res.status}: ${err.slice(0, 200)}`)
      return null
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content?.trim()
    if (!raw) return null
    return parseAISocialJSON(raw, title)
  } catch (err) {
    console.error('[aiSocialEditor] DeepSeek exception:', err)
    return null
  }
}

export async function generateSocialContent(
  title: string,
  description: string,
  cityName = 'Çanakkale'
): Promise<AISocialContent | null> {
  // Sadece DeepSeek kullan
  const result = await generateWithDeepSeek(title, description, cityName)
  if (result) {
    console.log('[aiSocialEditor] DeepSeek ile içerik üretildi')
    return result
  }
  console.error('[aiSocialEditor] DeepSeek başarısız — null döndürülüyor')
  return null
}
