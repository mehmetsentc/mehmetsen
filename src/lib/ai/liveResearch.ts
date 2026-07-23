/**
 * Real-time news research backed by Gemini Google Search grounding.
 * This module only researches and returns source-backed notes; DeepSeek remains
 * responsible for the final editorial copy.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-3.6-flash'

export interface GroundingSource {
  title: string
  url: string
}

export interface GroundedResearch {
  query: string
  brief: string
  sources: GroundingSource[]
  searchQueries: string[]
}

export function sanitizeGroundingSources(value: unknown): GroundingSource[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const sources: GroundingSource[] = []
  for (const raw of value.slice(0, 10)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const url = cleanSourceUrl(typeof item.url === 'string' ? item.url.trim() : '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    sources.push({
      title:
        typeof item.title === 'string' && item.title.trim()
          ? item.title.trim().slice(0, 180)
          : new URL(url).hostname,
      url,
    })
  }
  return sources
}

interface GeminiGroundingResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    groundingMetadata?: {
      webSearchQueries?: string[]
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string }
      }>
    }
  }>
}

function cleanSourceUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function parseGroundedResearch(
  query: string,
  response: GeminiGroundingResponse
): GroundedResearch | null {
  const candidate = response.candidates?.[0]
  const brief = (candidate?.content?.parts ?? [])
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim()
  if (brief.length < 120) return null

  const sourceCandidates: GroundingSource[] = []
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const rawUrl = chunk.web?.uri?.trim()
    const url = rawUrl ? cleanSourceUrl(rawUrl) : null
    if (!url) continue
    sourceCandidates.push({
      title: chunk.web?.title?.trim().slice(0, 180) || new URL(url).hostname,
      url,
    })
  }

  // Some Gemini responses include citation links in text but omit metadata.
  for (const match of brief.matchAll(/https?:\/\/[^\s)\]}>"']+/g)) {
    const url = cleanSourceUrl(match[0])
    if (!url) continue
    sourceCandidates.push({ title: new URL(url).hostname, url })
  }

  const sources = sanitizeGroundingSources(sourceCandidates)
  if (sources.length === 0) return null
  return {
    query,
    brief: brief.slice(0, 12_000),
    sources: sources.slice(0, 10),
    searchQueries: (candidate?.groundingMetadata?.webSearchQueries ?? [])
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10),
  }
}

export async function researchLiveNews(input: {
  query: string
  context?: string
}): Promise<GroundedResearch | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null
  const query = input.query.trim().slice(0, 500)
  if (!query) return null

  const model =
    process.env.GEMINI_GROUNDING_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    DEFAULT_MODEL
  const today = new Date().toISOString()
  const prompt = `Bugünün tarihi: ${today}

Şu haber konusunu Google Search ile canlı olarak araştır:
${query}

Ek bağlam:
${input.context?.trim().slice(0, 6_000) || 'Yok'}

Görev:
- Öncelikle son 48 saatteki gelişmeleri bul; konu gerektiriyorsa daha eski güvenilir bağlamı ekle.
- Önemli iddiaları mümkünse en az iki bağımsız ve güvenilir kaynaktan doğrula.
- Tarih, sayı, kişi, kurum ve doğrudan alıntıları kaynaklarda görmeden yazma.
- Söylenti ile doğrulanmış bilgiyi açıkça ayır.
- Türkçe, tarafsız bir araştırma notu hazırla.
- Her önemli bilgi için kaynak adını köşeli parantezle belirt.
- Kaynaklar yetersiz veya birbiriyle çelişkiliyse bunu açıkça yaz.

Yalnızca araştırma notunu döndür; yayımlanmış haber üslubunda manşet yazma.`

  try {
    const response = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 3000,
        },
      }),
      signal: AbortSignal.timeout(35_000),
    })
    if (!response.ok) {
      console.warn(`[liveResearch] Gemini ${response.status}`)
      return null
    }
    return parseGroundedResearch(query, await response.json() as GeminiGroundingResponse)
  } catch (error) {
    console.warn('[liveResearch] Gemini grounding failed:', error)
    return null
  }
}

export function isLiveResearchConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}
