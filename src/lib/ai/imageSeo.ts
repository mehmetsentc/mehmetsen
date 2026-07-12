const SYSTEM_PROMPT = `Sen NaHaber'in görsel SEO editörüsün. Haber görselleri için Türkçe SEO açıklaması (alt text / image caption) yazıyorsun.

Kurallar:
- 10-20 kelime, doğal ve akıcı Türkçe
- Haberin konusu ve görselin içeriğiyle uyumlu olsun
- Clickbait, klişe veya "görsel temsilidir" gibi boş ifadeler kullanma
- Yalnızca JSON döndür: {"caption": "..."}`

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export interface ImageSeoInput {
  imageUrl: string
  title: string
  content?: string
  summary?: string
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

function parseCaption(raw: string): string | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned) as { caption?: unknown }
    const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : ''
    return caption ? caption.slice(0, 200) : null
  } catch {
    const trimmed = raw.trim()
    return trimmed ? trimmed.slice(0, 200) : null
  }
}

async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; mimeType: string } | null> {
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

async function generateWithGeminiVision(input: ImageSeoInput): Promise<string | null> {
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
          maxOutputTokens: 220,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return raw ? parseCaption(raw) : null
  } catch {
    return null
  }
}

async function generateWithDeepSeek(input: ImageSeoInput): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-chat'
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
        max_tokens: 220,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const raw = json.choices[0]?.message?.content?.trim()
    return raw ? parseCaption(raw) : null
  } catch {
    return null
  }
}

export async function generateImageSeoCaption(input: ImageSeoInput): Promise<string | null> {
  const vision = await generateWithGeminiVision(input)
  if (vision) return vision
  return generateWithDeepSeek(input)
}
