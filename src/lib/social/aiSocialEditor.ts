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

import { clampAtWordBoundary, clampCompleteSentences, fitCompleteHeadline, isIncompleteHeadline } from './feedCaption'
import { isFaithfulSocialHeadline, repairSocialCopyAgainstSource } from './socialFactualFidelity'

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1/chat/completions'

/** Kısa ama TAM manşet; yarım sıfat kesimi olmasın (max 120, softMax ile tam başlık) */
const HEADLINE_MAX = 120
const HEADLINE_SOFT_MAX = 160
/** Tam özet için biraz daha alan; lacivert panel sığacak şekilde */
const STORY_SUMMARY_MAX = 200
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
Görsel format: Post görseli 4:5 (1080×1350), tam sayfa haber fotoğrafı (full-bleed); manşet + özet alttan yukarı koyu lacivert gradient scrim üzerinde.

ÇİFT HEDEF (ikisi birden zorunlu):
1) MERAK: Manşet ve post metni feed'de kaydırırken "dur, bunu okuyayım" dedirtsin; çarpıcı detay / beklenmedik açı / güçlü rakam öne çıksın.
2) BİLGİ + OLGUSAL SADAKAT: Okuyucu manşetten ve caption'dan ne olduğunu doğru anlasın. Kısaltırken anlam taşıyan kelime ASLA düşürme.

OLGU SADAKATİ — KESİN:
- Kaynaktaki sayı, özel isim, yer adı, unvan ve isim tamlamasının baş ismini KORU.
- YASAK örnek: "15 hava aracı müdahale etti" → "15 hava müdahale etti" (yanlış + dilbilgisi bozuk). DOĞRU: "15 hava aracı müdahale etti".
- Benzer: "itfaiye ekibi", "orman yangını", "yerleşim yeri", "jandarma ekipleri" — tamlama ismini atma.
- Rakamı yuvarlama / değiştirme / uydurma YASAK. Haberde yoksa ekleme.
- Türkçe dilbilgisi doğru olsun: özne tam ve anlamlı; "15 hava müdahale etti" gibi eksik isim tamlaması YASAK.

ÖNCELİKLİ HEDEF — DİKKAT ÇEKİCİLİK:
- Manşet ve alt açıklama OKUMAYA TEŞVİK EDİCİ olmalı; sıradan haber özeti yapıştırma gibi durmamalı.
- Merak uyandır, çarpıcı detayı öne çıkar — ama doğruluktan asla taviz verme.
- Ucuz clickbait / sahte vaat / abartılı şok dili YASAK — NaHaber güvenilir haber tonu korunur.

KURALLAR:
- headline: Görsel üzerine basılacak manşet = haber BAŞLIĞININ kısaltılmış gazete biçimi (max ${HEADLINE_MAX} karakter).
  * Yeni haber / yeni iddia / alakasız slogan UYDURMA. Kişi, yer, sayı, olay BAŞLIKTAKİ ile aynı kalsın.
  * Sadece kısalt: bağlaç/sıfat at; olguyu değiştirme. "Dikkat çekeyim diye" başka cümle yazmak YASAK.
  * UZUNLUK / SATIR: Ya TEK SATIRDA sığacak kadar kısa OL, YA DA 2–3 tematik satır için satır sonlarını \\n ile belirt. Max 3 satır.
  * TAM kelimeler; yarım cümle / kesik kelime YASAK. Nokta ile bitirme (gazete manşeti gibi).
  * Karakter sınırı için kelime atmak zorundaysan önce sıfat/bağlaç at; sayı + isim tamlamasını ASLA atma.
- storySummary: Manşetin ALTINDA görünecek TAM FAYDALI ÖZET. 1 veya 2 TAM cümle; toplam max ${STORY_SUMMARY_MAX} karakter. Her cümle nokta, ünlem veya soru işareti ile bitsin. Asla cümleyi veya kelimeyi ortadan kesme.
  * 1. görev — ANLAŞILIRLIK: Ne olduğu net olsun (kim/ne/nerede + ana olay). Okuyucu özetten haberi anlamalı; teaser / "ipuucu verip sakla" YASAK.
  * 2. görev — MERAK + DERİNLİK İŞTAHI: Özetin kendisi de ilgi çekici olsun; monoton "X açıklandı, Y yapıldı" kalıplarına düşme. Etki, sonuç veya sürpriz detayı öne çıkar — "git oku" demeden.
  * YASAK meta CTA kalıpları (özetten ASLA kullanma): "haberimizde", "detayları haberimizde", "detaylar için", "devamı için", "devamını oku", "tıklayın", "tıkla", "linkten", "haberi oku", "ayrıntılar", "işte detaylar" vb.
  * Sade, akıcı, dilbilgisi doğru Türkçe; jargon ve abartı yok. Olgu kelimelerini düşürme.
- caption: Facebook/Instagram POST açıklama gövdesi (URL ve hashtag YOK — sistem ekler).
  * AMAÇ: Feed'de kaydıran kullanıcıyı yakalamak — ilk cümle merak + doğru bilgi birleşimi olsun.
  * İçerik: (1) Haberin TAM manşetini yansıtan açılış cümlesi/paragrafı — manşet anlamı eksik/yarım kalmasın; sayı/isim/tamlama doğru.
    (2) TAM kısa özet: ne oldu + önemli detay/etki — okunabilir 2–3 paragraf.
  * Toplam ~400–800 karakter. 1. paragraf emoji ile başlasın. Paragraflar arasında boş satır (\\n\\n).
  * YALNIZCA tamamlanmış cümleler; yarım cümle, kesik kelime, "…" ile biten teaser YASAK.
  * URL / "linkten okuyun" / "haberimizde" ekleme.
  * NOT: Post görseli 4:5 (1080×1350) — caption kısa-orta olsun, görselle uyumlu uzunluk.
- hashtags: TAM OLARAK 5 adet, Türkçe, #ile başlayan, haber konusuyla ilgili
- altText: SEO uyumlu, haber ne anlattığını açıklayan, 10-20 kelime
- ÇIKTI: Yalnızca geçerli JSON, başka hiçbir şey ekleme`

function buildPrompt(title: string, description: string, cityName: string): string {
  return `Aşağıdaki haber için sosyal medya + hikaye görseli içeriği oluştur.
ÖNEMLİ: Başlık ve açıklamalar hem DİKKAT ÇEKİCİ / MERAK UYANDIRICI hem BİLGİLENDİRİCİ olsun. Sıradan özet yapıştırma. Doğruluktan taviz yok: sayı, isim, "hava aracı" gibi tamlama isimlerini düşürme; Türkçe dilbilgisi doğru olsun.

BAŞLIK: ${title}
HABERİN İÇERİĞİ: ${description.slice(0, 1500)}
ŞEHİR: ${cityName}
GÖRSEL FORMAT: Post 4:5 (1080×1350) — tam sayfa haber fotoğrafı; manşet+özet alttan yukarı gradient scrim üzerinde

JSON şeması:
{
  "headline": "string (max ${HEADLINE_MAX}: BAŞLIĞIN kısaltılmış hali; uydurma manşet yok; nokta yok)",
  "storySummary": "string (1-2 tam cümle, max ${STORY_SUMMARY_MAX} karakter: ne oldu + etki/sonuç net; olgu sadık; meta CTA YASAK — haberimizde/tıkla/devamı yok; noktalama ile bitsin; merak uyandırıcı)",
  "caption": "string (2-3 paragraf: tam manşet anlamı + tam kısa özet; 400-800 karakter; emoji ile başlar; \\n\\n; URL yok; yarım cümle yok; ilk cümle yakalayıcı + doğru)",
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
function clampHeadline(s: string, max: number, sourceTitle = ''): string {
  const lines = s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
  if (lines.length === 0) return ''
  if (lines.length === 1) {
    return fitCompleteHeadline(lines[0], sourceTitle || lines[0], max, HEADLINE_SOFT_MAX)
  }
  // Çok satır: toplam max'ı satırlara orantılı dağıt; aşarsa son satırdan kısalt
  let joined = lines.join('\n')
  if (joined.replace(/\n/g, '').length <= max && joined.length <= max + lines.length - 1) {
    return fitCompleteHeadline(joined.replace(/\n/g, ' '), sourceTitle || joined, max, HEADLINE_SOFT_MAX)
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
  const multi = out.join('\n')
  return multi
    ? fitCompleteHeadline(multi.replace(/\n/g, ' '), sourceTitle || multi, max, HEADLINE_SOFT_MAX)
    : fitCompleteHeadline(lines.join(' '), sourceTitle || lines.join(' '), max, HEADLINE_SOFT_MAX)
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
  const clamped = clampCompleteSentences(stripMetaCtas(base), STORY_SUMMARY_MAX, STORY_SUMMARY_MAX + 32)
  if (/[.!?]$/.test(clamped)) return clamped
  // Tek satır başlıktan özet üretilemediyse noktalı kısa cümle
  return clampAtWordBoundary(`${clamped.replace(/[.!?…]+$/, '')}.`, STORY_SUMMARY_MAX)
}

function parseAISocialJSON(raw: string, title: string, description = ''): AISocialContent | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const p = JSON.parse(cleaned) as Partial<AISocialContent>
    const str = (v: unknown, fallback: string): string =>
      typeof v === 'string' && v.trim() ? v.trim() : fallback
    const tags: string[] = Array.isArray(p.hashtags)
      ? p.hashtags.map((t) => { const s = String(t).trim(); return s.startsWith('#') ? s : `#${s}` }).slice(0, 5)
      : ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye']
    while (tags.length < 5) tags.push('#NaHaber')
    const fidelity = (s: string) => repairSocialCopyAgainstSource(s, title, description)
    const caption = clampCaptionBody(fidelity(str(p.caption, `📰 ${title}`)), CAPTION_MAX)
    let headline = clampHeadline(fidelity(str(p.headline, title)), HEADLINE_MAX, title)
    // AI yarım bıraktıysa veya başlıktan saptiysa kaynak başlığa düş
    if (
      (isIncompleteHeadline(headline) && title.trim()) ||
      !isFaithfulSocialHeadline(headline, title)
    ) {
      headline = fitCompleteHeadline(title, title, HEADLINE_MAX, HEADLINE_SOFT_MAX)
    }
    const storySummary = clampCompleteSentences(
      fidelity(stripMetaCtas(str(p.storySummary, fallbackStorySummary(title, caption)))),
      STORY_SUMMARY_MAX,
      STORY_SUMMARY_MAX + 32,
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
    return parseAISocialJSON(raw, title, description)
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
    return parseAISocialJSON(raw, title, description)
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
  const result = await generateWithDeepSeek(title, description, cityName)
  if (result) {
    if (!isFaithfulSocialHeadline(result.headline, title)) {
      result.headline = fitCompleteHeadline(title, title, HEADLINE_MAX, HEADLINE_SOFT_MAX)
    }
    console.log('[aiSocialEditor] DeepSeek ile içerik üretildi')
    return result
  }
  console.error('[aiSocialEditor] DeepSeek başarısız — null döndürülüyor')
  return null
}
