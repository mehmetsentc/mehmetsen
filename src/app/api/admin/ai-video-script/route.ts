import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'

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

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_NEWS_MODEL || 'deepseek-v4-flash',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Konu: ${topic}` }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })
    if (!res.ok) throw new Error(`OpenAI ${res.status}`)
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const parsed = JSON.parse(json.choices[0]?.message?.content ?? '{}') as Record<string, unknown>
    return NextResponse.json({ success: true, scriptType, tone, ...parsed })
  } catch (error) {
    console.error('[ai-video-script]', error)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
