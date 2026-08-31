import { NextResponse } from 'next/server'
import { verifyFirebaseIdToken } from '@/lib/apiAuth.server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import { deepseekChatCompletion, getDeepSeekApiKey } from '@/lib/ai/deepseekClient'

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

async function callDeepSeekImprove(
  content: string,
  title: string
): Promise<{ title: string; content: string; summary: string } | null> {
  const { isManualEditorAiEnabled } = await import('@/services/crawler/automatedAiPolicy')
  if (!isManualEditorAiEnabled()) return null
  if (!getDeepSeekApiKey()) return null

  try {
    const userMessage = `BAŞLIK: ${title}\n\nİÇERİK:\n${content}`
    const raw = await deepseekChatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      maxTokens: 1500,
      timeoutMs: 20_000,
      disableThinking: true,
      jsonMode: true,
      telemetry: {
        agentName: 'improve_text',
        operation: 'improve_user_text',
        promptVersion: 'improve-text:v1',
      },
    })
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

  const result = await callDeepSeekImprove(content, title)
  if (!result) {
    return NextResponse.json({ error: 'AI servisi şu an kullanılamıyor' }, { status: 503 })
  }

  return NextResponse.json(result)
}
