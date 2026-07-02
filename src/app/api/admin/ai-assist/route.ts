import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'

type AssistMode = 'create' | 'rewrite' | 'seo' | 'tags' | 'headline' | 'trends'

const SYSTEM_PROMPTS: Record<AssistMode, string> = {
  create: `Sen deneyimli bir Türk gazetecisisin. Verilen konuda profesyonel bir haber metni yaz.
JSON formatında yanıt ver: {"title":"...","content":"...","summary":"...","spot":"..."}
spot: 5W+1H (Kim,Ne,Nerede,Ne Zaman,Neden,Nasıl) yanıtlayan 2-4 cümlelik haber girizgahı.`,

  rewrite: `Sen deneyimli bir Türk gazete editörüsün. Verilen haberi yeniden yaz, daha akıcı ve profesyonel yap.
JSON: {"title":"...","content":"...","summary":"...","spot":"..."}`,

  seo: `Sen bir SEO uzmanısın. Verilen haber başlığı için SEO meta verisi oluştur.
JSON: {"seoTitle":"...","seoDescription":"..."}
seoTitle: 50-60 karakter. seoDescription: 150-160 karakter. Türkçe olsun.`,

  tags: `Verilen haber için en uygun etiketleri oluştur.
JSON: {"tags":["tag1","tag2",...]} — en fazla 8 etiket, Türkçe, küçük harf.`,

  headline: `Verilen haber içeriği için 5 farklı başlık alternatifi oluştur.
JSON: {"headlines":["başlık1","başlık2","başlık3","başlık4","başlık5"]}`,

  trends: `Türkiye gündemindeki trend konuları analiz et ve haber fikirleri sun.
JSON: {"trends":[{"topic":"...","angle":"...","urgency":"high|medium|low"}]} — 5 trend.`,
}

async function callAi(systemPrompt: string, userMessage: string): Promise<Record<string, unknown>> {
  // DeepSeek (tek sağlayıcı)
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (deepseekKey) {
    const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-chat'
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deepseekKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`DeepSeek error ${res.status}`)
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    return JSON.parse(json.choices[0]?.message?.content ?? '{}') as Record<string, unknown>
  }

  throw new Error('No AI key configured (DEEPSEEK_API_KEY required)')
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { mode: AssistMode; input?: string }
  try { body = await request.json() as { mode: AssistMode; input?: string } }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { mode, input = '' } = body
  if (!mode || !SYSTEM_PROMPTS[mode]) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })

  const userMessage = mode === 'trends' ? 'Türkiye gündemini analiz et.' : input.trim() || 'Haber içeriği sağlanmadı.'

  try {
    const parsed = await callAi(SYSTEM_PROMPTS[mode], userMessage)
    return NextResponse.json({ success: true, mode, ...parsed })
  } catch (error) {
    console.error('[ai-assist]', error)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
