import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { recordDirectDeepSeekObservation } from '@/lib/ai/deepseekClient'

type ScriptType = 'news_report' | 'breaking' | 'analysis' | 'interview' | 'social_short'
type Tone = 'formal' | 'conversational' | 'urgent'

const TYPE_PROMPTS: Record<ScriptType, string> = {
  news_report: 'Standart haber bülteni formatı. Giriş-gelişme-sonuç yapısı.',
  breaking: 'Son dakika formatı. Kısa, acil ve dikkat çekici. İlk 10 saniyede en önemli bilgi.',
  analysis: 'Derinlemesine analiz formatı. Arka plan, uzman görüşleri, karşılaştırma.',
  interview: 'Röportaj formatı. Soru-cevap yapısı, konuğun tanıtımı dahil.',
  social_short: 'Sosyal medya için kısa video (60-90 saniye). Hook-içerik-CTA yapısı.',
}
const TONE_DESC: Record<Tone, string> = {
  formal: 'Resmi, profesyonel gazetecilik dili.',
  conversational: 'Sohbet havasında, samimi ve anlaşılır.',
  urgent: 'Hızlı, dinamik, aciliyet hissi veren.',
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { isManualEditorAiEnabled } = await import('@/services/crawler/automatedAiPolicy')
  if (!isManualEditorAiEnabled()) {
    return NextResponse.json(
      { error: 'MANUAL_EDITOR_AI_ENABLED=false (Manual editor AI is disabled in production)' },
      { status: 403 }
    )
  }

  let body: { scriptType: ScriptType; tone: Tone; topic: string; duration?: number }
  try { body = await request.json() as { scriptType: ScriptType; tone: Tone; topic: string; duration?: number } }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { scriptType = 'news_report', tone = 'formal', topic = '', duration = 90 } = body
  if (!topic.trim()) return NextResponse.json({ error: 'Topic required' }, { status: 400 })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const systemPrompt = `Sen profesyonel bir Türk TV haber yönetmenisin.
Format: ${TYPE_PROMPTS[scriptType]}
Ton: ${TONE_DESC[tone]}
Süre hedefi: ~${duration} saniye.
JSON: {"title":"...","duration":saniye,"intro":"...","segments":[{"label":"...","content":"...","notes":"...","duration":saniye}],"outro":"...","notes":"...","hashtags":["#..."]}`

  const startedAt = Date.now()
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_NEWS_MODEL || 'deepseek-v4-flash',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Konu: ${topic}` }],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })
    if (!res.ok) {
      recordDirectDeepSeekObservation({
        agentName: 'video_script',
        operation: 'admin_video_script',
        promptVersion: 'admin-video-script:v1',
        startedAt,
        success: false,
        statusCode: res.status,
      })
      throw new Error(`OpenAI ${res.status}`)
    }
    const json = await res.json() as { choices: Array<{ message: { content: string } }>; usage?: unknown }
    const raw = json.choices[0]?.message?.content
    recordDirectDeepSeekObservation({
      agentName: 'video_script',
      operation: 'admin_video_script',
      promptVersion: 'admin-video-script:v1',
      startedAt,
      success: Boolean(raw),
      statusCode: 200,
      body: json,
      errorMessage: raw ? undefined : 'empty_content',
    })
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>
    return NextResponse.json({ success: true, scriptType, tone, ...parsed })
  } catch (error) {
    console.error('[ai-video-script]', error)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
