import { NextResponse } from 'next/server'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `Sen deneyimli bir Türk haber editörüsün.
Kullanıcının yazdığı ham metni profesyonel bir haber metnine dönüştür.

KURALLAR:
- Devrik cümleleri düzelt, gazetecilik diliyle yeniden yaz
- 5N1K (Kim, Ne, Nerede, Ne Zaman, Neden, Nasıl) yapısını koru
- Nesnel ol, abartıdan kaçın
- Türkçe noktalama ve yazım kurallarına uy
- Başlığı güçlendir ama clickbait yapma
- Orijinal içeriğin özünü koru, ekstra bilgi uydurma

JSON formatında yanıt ver:
{
  "title": "Düzeltilmiş ve güçlendirilmiş başlık",
  "content": "Profesyonel haber metni (paragraflar halinde)",
  "summary": "2-3 cümlelik özet"
}`

async function callGemini(content: string, title: string): Promise<{ title: string; content: string; summary: string } | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  if (!geminiKey) return null

  try {
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash-preview-05-20'
    const userMessage = `BAŞLIK: ${title}\n\nİÇERİK:\n${content}`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20_000),
      }
    )
    if (!res.ok) return null
    const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as { title?: string; content?: string; summary?: string }
    if (!parsed.title || !parsed.content) return null
    return {
      title: parsed.title,
      content: parsed.content,
      summary: parsed.summary ?? '',
    }
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const auth = await verifyFirebaseIdToken(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateKey = `improve-text:${auth.uid}:${getClientIp(request)}`
  if (!checkRateLimit(rateKey, 10, 60_000)) return rateLimitResponse()

  let body: { title?: unknown; content?: unknown }
  try {
    body = await request.json() as { title?: unknown; content?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''

  if (!content || content.length < 20) {
    return NextResponse.json({ error: 'İçerik çok kısa' }, { status: 400 })
  }

  const result = await callGemini(content, title)
  if (!result) {
    return NextResponse.json({ error: 'AI servisi şu an kullanılamıyor' }, { status: 503 })
  }

  return NextResponse.json(result)
}
