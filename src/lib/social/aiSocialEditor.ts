/**
 * AI Social Media Editor
 *
 * Gemini 2.5 Flash kullanarak haber için sosyal medya içeriği üretir:
 *   - headline: Görsel üzerine basılacak kısa manşet (max 60 karakter)
 *   - caption:  Facebook/Instagram açıklaması (emoji + haber özeti)
 *   - hashtags: 5 ilgili Türkçe hashtag
 *   - altText:  SEO uyumlu görsel alt metni
 *
 * Gemini API: REST (SDK yok)
 * Env: GEMINI_API_KEY, GEMINI_MODEL (default: gemini-2.5-flash)
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEEPSEEK_BASE = 'https://api.deepseek.com/chat/completions'

export interface AISocialContent {
  headline: string
  caption: string
  hashtags: string[]
  altText: string
}

const SYSTEM_PROMPT = `Sen NaHaber'in Sosyal Medya Editörüsün.
Türkçe haber başlıklarından sosyal medya içeriği üretiyorsun.
KURALLARI:
- headline: Dikkat çekici, kısa, clickbait olmayan TÜRKÇE manşet (max 60 karakter)
- caption: 200-280 karakter, emoji ile başla, haber özetini ver, URL olmadan bitir
- hashtags: TAM OLARAK 5 adet, Türkçe, #ile başlayan, haber konusuyla ilgili
- altText: SEO uyumlu, haber ne anlattığını açıklayan, 10-20 kelime
- ÇIKTI: Yalnızca geçerli JSON, başka hiçbir şey ekleme`

function buildPrompt(title: string, description: string, cityName: string): string {
  return `Aşağıdaki haber için sosyal medya içeriği oluştur:

BAŞLIK: ${title}
ÖZET: ${description.slice(0, 500)}
ŞEHİR: ${cityName}

JSON şeması:
{
  "headline": "string (max 60 karakter, büyük-küçük harf karışık, dikkat çekici)",
  "caption": "string (200-280 karakter, emoji ile başla)",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "altText": "string (10-20 kelime, SEO açıklaması)"
}`
}

function parseAISocialJSON(raw: string, title: string): AISocialContent | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const p = JSON.parse(cleaned) as Partial<AISocialContent>
    const str = (v: unknown, fallback: string, maxLen?: number): string => {
      const s = typeof v === 'string' && v.trim() ? v.trim() : fallback
      return maxLen ? s.slice(0, maxLen) : s
    }
    const tags: string[] = Array.isArray(p.hashtags)
      ? p.hashtags.map((t) => { const s = String(t).trim(); return s.startsWith('#') ? s : `#${s}` }).slice(0, 5)
      : ['#NaHaber', '#Çanakkale', '#SonDakika', '#Haber', '#Türkiye']
    while (tags.length < 5) tags.push('#NaHaber')
    return {
      headline: str(p.headline, title.slice(0, 60), 60),
      caption:  str(p.caption,  `📰 ${title}`, 300),
      hashtags: tags,
      altText:  str(p.altText,  title, 200),
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
        generationConfig: { temperature: 0.4, topP: 0.85, maxOutputTokens: 512, responseMimeType: 'application/json' },
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
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(title, description, cityName) },
        ],
        temperature: 0.4,
        max_tokens: 512,
        response_format: { type: 'json_object' },
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
  // Gemini önce dene, başarısız olursa DeepSeek'e düş
  const geminiResult = await generateWithGemini(title, description, cityName)
  if (geminiResult) {
    console.log('[aiSocialEditor] Gemini ile içerik üretildi')
    return geminiResult
  }
  console.warn('[aiSocialEditor] Gemini başarısız, DeepSeek deneniyor...')
  const deepSeekResult = await generateWithDeepSeek(title, description, cityName)
  if (deepSeekResult) {
    console.log('[aiSocialEditor] DeepSeek ile içerik üretildi')
    return deepSeekResult
  }
  console.error('[aiSocialEditor] Her iki model de başarısız — null döndürülüyor')
  return null
}
