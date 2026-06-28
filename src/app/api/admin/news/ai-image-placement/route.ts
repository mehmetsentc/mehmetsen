import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ImageInput {
  url: string
  caption?: string
  alt?: string
}

interface RequestBody {
  title?: string
  content?: string
  images?: ImageInput[]
}

interface AiResponse {
  /** AI tarafından önerilen optimal sıra (URL listesi). */
  order: string[]
  /** İsteğe bağlı: caption boş olan görseller için altyazı önerileri (URL -> caption). */
  captions: Record<string, string>
}

const SYSTEM_PROMPT = `Sen profesyonel bir Türk haber editörüsün. Verilen haber metni
ile birlikte sıralanmamış N adet görsel bilgisini alacaksın. Görselleri haber
akışına en uygun sırada okuyucuya sunmak için sıralaman gerekiyor.

Kurallar:
  1. İlk paragrafta anlatılanı temsil eden görsel ÖNCE gelmeli.
  2. Hikayenin orta/son kısmında geçen konular için kalan görselleri sıraya
     koy. Görseller paragraflar arasında dağıtılacak.
  3. Caption (altyazı) boş olan görseller için kısa (max 12 kelime) Türkçe
     altyazı öner; haberin akışına uyumlu olsun, klişe ("Görsel temsilidir")
     yazma. Eğer caption zaten doluysa onu DEĞİŞTİRME — sadece boşları
     doldur.
  4. Yanıtın YALNIZCA aşağıdaki JSON şemasında olsun:
     {"order": ["url1", "url2", ...], "captions": {"urlX": "altyazı...", ...}}
     order alanı tüm input URL'lerinin permütasyonu olmalı (eksik/fazla yok).
     captions alanı isteğe bağlı; boş olanlar için doldurabilirsin.`

async function callAi(systemPrompt: string, userMessage: string): Promise<AiResponse> {
  // 1) Gemini
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash-preview-05-20'
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(20_000),
        }
      )
      if (res.ok) {
        const json = await res.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (raw) return JSON.parse(raw) as AiResponse
      }
    } catch { /* fall through */ }
  }

  // 2) DeepSeek
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (deepseekKey) {
    const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-chat'
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deepseekKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`DeepSeek error ${res.status}`)
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    return JSON.parse(json.choices[0]?.message?.content ?? '{}') as AiResponse
  }

  throw new Error('No AI key configured (GEMINI_API_KEY or DEEPSEEK_API_KEY required)')
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'ai:use')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const images = Array.isArray(body.images) ? body.images.filter((i) => i?.url) : []
  if (images.length < 2) {
    return NextResponse.json(
      { order: images.map((i) => i.url), captions: {} },
      { status: 200 }
    )
  }

  const truncatedContent = (body.content ?? '').slice(0, 6000)
  const userMessage = [
    `Başlık: ${body.title?.trim() || '(başlıksız)'}`,
    '',
    'Haber metni:',
    truncatedContent,
    '',
    `Görseller (${images.length} adet):`,
    ...images.map((img, idx) =>
      [
        `${idx + 1}. URL: ${img.url}`,
        img.caption ? `   Mevcut altyazı: ${img.caption}` : '   Mevcut altyazı: (yok)',
        img.alt ? `   Alt metin: ${img.alt}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    ),
  ].join('\n')

  try {
    const parsed = await callAi(SYSTEM_PROMPT, userMessage)
    const incomingUrls = new Set(images.map((i) => i.url))
    const validOrder = (parsed.order ?? []).filter((u) => incomingUrls.has(u))
    // Eksik URL'leri arkaya ekle (AI yanıtında yoksa kaybolmasın)
    for (const img of images) {
      if (!validOrder.includes(img.url)) validOrder.push(img.url)
    }
    const captions: Record<string, string> = {}
    for (const [url, cap] of Object.entries(parsed.captions ?? {})) {
      if (incomingUrls.has(url) && typeof cap === 'string' && cap.trim()) {
        captions[url] = cap.trim().slice(0, 160)
      }
    }
    return NextResponse.json({ order: validOrder, captions })
  } catch (error) {
    console.error('[ai-image-placement]', error)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
