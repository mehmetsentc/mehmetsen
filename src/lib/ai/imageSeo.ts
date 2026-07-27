import { isKnownNewsImageHost } from '@/constants/imageHosts'

const SYSTEM_PROMPT = `Sen NaHaber'in görsel editörüsün. Haber görsellerini analiz edip Türkçe yayın metadatası hazırlıyorsun.

Kurallar:
- caption görseli kısa ve doğal Türkçe tek cümleyle tanımla; kelime saymadan yaz
- alt erişilebilirlik için görselde gerçekten görüleni kısaca anlatsın
- Haberin konusu ve görselin içeriğiyle uyumlu ol
- Görselde açıkça görünmeyen kişi, yer, tarih veya olayı uydurma
- Clickbait, klişe veya "görsel temsilidir" gibi boş ifadeler kullanma
- role: hero, inline, gallery veya skip
- relevanceScore: haberle ilgisini 0-100 puanla
- Yalnızca JSON döndür:
{"caption":"...","alt":"...","creditHint":null,"role":"hero|inline|gallery|skip","relevanceScore":0}`

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface ImageSeoInput {
  imageUrl: string
  title: string
  content?: string
  summary?: string
}

export interface ImageAnalysis {
  caption: string
  alt: string
  creditHint: string | null
  role: 'hero' | 'inline' | 'gallery' | 'skip'
  relevanceScore: number
}

function buildUserPrompt(input: ImageSeoInput, hasVision: boolean): string {
  const context = (input.content?.trim() || input.summary?.trim() || '').slice(0, 2500)
  const lines = [
    `Haber başlığı: ${input.title.trim() || '(başlıksız)'}`,
  ]
  if (context) {
    lines.push('', 'Haber metni özeti:', context)
  }
  lines.push(
    '',
    hasVision
      ? 'Ekteki görseli incele ve bu haber için SEO uyumlu Türkçe görsel açıklaması yaz.'
      : 'Bu haberin kapak görseli için SEO uyumlu Türkçe görsel açıklaması yaz.'
  )
  return lines.join('\n')
}

/** Kelime ortasında kesmez; max karakter sınırından önceki son boşlukta keser */
function sliceAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

/** JSON içine gömülü başka bir JSON ise iç caption'ı çıkarır */
function extractCaption(raw: string): string {
  const s = raw.trim()
  if (!s.startsWith('{')) return s
  try {
    const obj = JSON.parse(s) as Record<string, unknown>
    if (typeof obj.caption === 'string') return obj.caption.trim()
  } catch { /* truncated — try regex */ }
  const m = s.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*?)(?:"|$)/)
  return m?.[1]?.trim() || s
}

function parseAnalysis(raw: string): ImageAnalysis | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    let caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : ''
    // Thinking model bazen caption değerine iç içe JSON koyuyor — çöz
    if (caption.startsWith('{')) caption = extractCaption(caption)
    if (!caption) return null
    let alt = typeof parsed.alt === 'string' ? parsed.alt.trim() : caption
    if (alt.startsWith('{')) alt = extractCaption(alt)
    const role =
      parsed.role === 'hero' || parsed.role === 'gallery' || parsed.role === 'skip'
        ? parsed.role
        : 'inline'
    const score = Number(parsed.relevanceScore)
    return {
      caption: sliceAtWord(caption, 160),
      alt: sliceAtWord(alt || caption, 110),
      creditHint:
        typeof parsed.creditHint === 'string' && parsed.creditHint.trim()
          ? parsed.creditHint.trim().slice(0, 120)
          : null,
      role,
      relevanceScore: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 50,
    }
  } catch {
    const trimmed = raw.trim()
    if (!trimmed) return null
    // Truncated JSON like {"caption":"..." — try to extract the value via regex
    if (trimmed.startsWith('{')) {
      const m = trimmed.match(/"caption"\s*:\s*"((?:[^"\\]|\\.)*?)(?:"|$)/)
      const extracted = m?.[1]?.trim()
      if (extracted) {
        return {
          caption: sliceAtWord(extracted, 160),
          alt: sliceAtWord(extracted, 110),
          creditHint: null,
          role: 'inline',
          relevanceScore: 50,
        }
      }
    }
    return {
      caption: sliceAtWord(trimmed, 160),
      alt: sliceAtWord(trimmed, 110),
      creditHint: null,
      role: 'inline',
      relevanceScore: 50,
    }
  }
}

export function isAllowedVisionImageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return (
      host === 'storage.googleapis.com' ||
      host.endsWith('.storage.googleapis.com') ||
      isKnownNewsImageHost(host)
    )
  } catch {
    return false
  }
}

async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string } | null> {
  if (!isAllowedVisionImageUrl(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > 4 * 1024 * 1024) return null
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null
    return { data: Buffer.from(buf).toString('base64'), mimeType: contentType }
  } catch {
    return null
  }
}

async function generateWithGeminiVision(input: ImageSeoInput): Promise<ImageAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null

  const image = await fetchImageAsBase64(input.imageUrl)
  if (!image) return null

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: image.mimeType, data: image.data } },
            { text: buildUserPrompt(input, true) },
          ],
        }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(18_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
    }
    // thinking models may put thoughts in parts[0]; find first non-thought text part
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const raw = parts.find(p => !p.thought && typeof p.text === 'string')?.text?.trim()
    return raw ? parseAnalysis(raw) : null
  } catch {
    return null
  }
}

async function generateWithDeepSeek(input: ImageSeoInput): Promise<ImageAnalysis | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input, false) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.35,
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const raw = json.choices[0]?.message?.content?.trim()
    return raw ? parseAnalysis(raw) : null
  } catch {
    return null
  }
}

export async function generateImageAnalysis(input: ImageSeoInput): Promise<ImageAnalysis | null> {
  // Cost: Gemini vision is expensive — DeepSeek text-first by default.
  // Opt in with GEMINI_VISION_ENABLED=1 only when true vision captions are needed.
  if (process.env.GEMINI_VISION_ENABLED?.trim() === '1') {
    const vision = await generateWithGeminiVision(input)
    if (vision) return vision
  }
  return generateWithDeepSeek(input)
}

export async function generateImageSeoCaption(input: ImageSeoInput): Promise<string | null> {
  return (await generateImageAnalysis(input))?.caption ?? null
}
