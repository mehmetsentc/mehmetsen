import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { buildBodyBlocksFromAi } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'

type AssistMode = 'create' | 'rewrite' | 'seo' | 'tags' | 'headline' | 'trends' | 'keywords'

const SYSTEM_PROMPTS: Record<AssistMode, string> = {
  create: `Sen deneyimli bir Türk gazetecisisin. Verilen konuda profesyonel bir haber metni yaz.
JSON formatında yanıt ver: {"title":"...","content":"...","summary":"...","spot":"..."}
spot: 5W+1H (Kim,Ne,Nerede,Ne Zaman,Neden,Nasıl) yanıtlayan 2-4 cümlelik haber girizgahı.
content içinde ## H2 ve ### H3 markdown başlıkları kullan. # H1 KULLANMA (sayfa başlığı H1'dir).`,

  rewrite: `Sen deneyimli bir Türk gazete editörüsün. Verilen haberi yeniden yaz, daha akıcı ve profesyonel yap.
JSON: {"title":"...","content":"...","summary":"...","spot":"..."}
content içinde ## / ### başlıklar kullan; # H1 yazma.`,

  seo: `Sen bir SEO uzmanısın. Verilen haber başlığı için SEO meta verisi oluştur.
JSON: {"seoTitle":"...","seoDescription":"..."}
seoTitle: 50-60 karakter. seoDescription: 150-160 karakter. Türkçe olsun.`,

  tags: `Verilen haber için en uygun etiketleri oluştur.
JSON: {"tags":["tag1","tag2",...]} — en fazla 8 etiket, Türkçe, küçük harf.`,

  headline: `Verilen haber içeriği için 5 farklı başlık alternatifi oluştur.
JSON: {"headlines":["başlık1","başlık2","başlık3","başlık4","başlık5"]}`,

  trends: `Türkiye gündemindeki trend konuları analiz et ve haber fikirleri sun.
JSON: {"trends":[{"topic":"...","angle":"...","urgency":"high|medium|low"}]} — 5 trend.`,

  keywords: `Sen bir SEO uzmanısın. Verilen haber başlığı ve içeriği için arama motoru optimizasyonuna uygun anahtar kelimeler oluştur.
JSON: {"keywords":["kelime1","kelime2",...]} — 8 ile 15 arasında anahtar kelime, Türkçe, küçük harf, tekil veya 2-3 kelimelik ifadeler olabilir.
Kişi adları, yer adları, konu başlıkları ve arama niyetiyle eşleşen terimleri dahil et.`,
}

async function callAi(systemPrompt: string, userMessage: string): Promise<Record<string, unknown>> {
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
        max_tokens: 2500,
      }),
      signal: AbortSignal.timeout(35_000),
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

  let body: { mode: AssistMode; input?: string; imageUrl?: string }
  try { body = await request.json() as { mode: AssistMode; input?: string; imageUrl?: string } }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { mode, input = '', imageUrl } = body
  if (!mode || !SYSTEM_PROMPTS[mode]) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })

  const userMessage = mode === 'trends' ? 'Türkiye gündemini analiz et.' : input.trim() || 'Haber içeriği sağlanmadı.'

  try {
    const parsed = await callAi(SYSTEM_PROMPTS[mode], userMessage)

    if (mode === 'create' || mode === 'rewrite') {
      const title = String(parsed.title ?? '').trim()
      const content = String(parsed.content ?? '').trim()
      const spot = String(parsed.spot ?? '').trim()
      const summary = String(parsed.summary ?? '').trim()
      const bodyBlocks = buildBodyBlocksFromAi({
        title: title || 'Haber',
        spot,
        summary,
        content,
        imageUrl: imageUrl?.trim(),
        imageCaption: title || undefined,
      })
      return NextResponse.json({
        success: true,
        mode,
        title,
        spot,
        summary,
        content: articleBlocksToPlainText(bodyBlocks) || content,
        bodyBlocks,
      })
    }

    return NextResponse.json({ success: true, mode, ...parsed })
  } catch (error) {
    console.error('[ai-assist]', error)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
