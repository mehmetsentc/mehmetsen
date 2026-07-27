/**
 * STAGE 1 — Content Writer
 *
 * Ham RSS → profesyonel Türkçe gazete haberi.
 * Persona (V2) varsa onun constitution/task prompt'u esas alınır;
 * burada yalnızca sabit güvenlik + haber biçimi kuralları eklenir.
 */

export interface WrittenArticle {
  title: string
  spot: string
  summary: string
  content: string
  seoTitle: string
  seoDescription: string
  aiWritten: boolean
}

interface WriterInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  systemPromptOverride?: string
  userPromptOverride?: string
  model?: string
}

/** Ortak güvenlik — persona ile birleşir, makale şişirme YOK */
const HARD_RULES = `MUTLAK KURALLAR:
- Kaynakta OLMAYAN bilgi, rakam, alıntı, yasa adı uydurma
- Kaynak ajans/gazete adını (AA, DHA vb.) metne yazma
- Başlıkta FLAŞ / SON DAKİKA / büyük harf spam yok
- Yarım cümle, kesilmiş kelime bırakma
- Caption metnini ## başlık yapma
- Çıktı her zaman Türkçe
- Yalnızca geçerli JSON döndür`

/**
 * Varsayılan haber biçimi (persona yoksa).
 * Ters piramit: özet → olgular → kısa bağlam. Ansiklopedi / okul kompozisyonu YASAK.
 */
const DEFAULT_NEWS_SYSTEM = `Sen NaHaber içerik editörüsün. Kısa, net, olgu temelli GAZETE HABERİ yaz.

HABER BİÇİMİ (zorunlu):
- Ters piramit: en önemli bilgi başta (kim, ne, nerede, ne zaman)
- spot: 2-4 cümle lider; content spot'u tekrarlama
- content: 180-350 kelime yeter; gereksiz uzatma YASAK
- En fazla 1-2 ## başlık; yalnızca olay-özgü (ör. "Ceza tutarı", "Resmi açıklama")
- YASAK başlıklar: "Sonuç", "Giriş", "Gelişme", "Önemi", "Biyolojik Çeşitliliğin Korunması", "Genel Değerlendirme" ve benzeri ders kitabı / ansiklopedi başlıkları
- YASAK: uzun genel bilgi paragrafları, ahlak dersi, "bu nedenle vatandaşların…" nutukları
- Kaynak inceyse kısa yaz; doldurma yapma

ALANLAR:
- title: manşet, max 70 karakter
- spot: lider paragraf
- summary: feed teaser max 120 karakter, title'dan farklı
- content: gövde (markdown ## isteğe bağlı, # H1 kullanma)
- seoTitle: 55-65 karakter
- seoDescription: 145-160 karakter`

function buildPrompt(input: WriterInput): string {
  const content = input.originalContent || input.originalSummary || ''
  const sourceNote = input.sourceUrl
    ? `Kaynak URL: ${input.sourceUrl}`
    : `Kaynak: ${input.sourceLabel}`
  return `${sourceNote}
Başlık: ${input.originalTitle}
Özet: ${input.originalSummary || ''}
İçerik:
${content.slice(0, 6000)}

GAZETE HABERİ yaz (ters piramit). Ansiklopedi / "Sonuç" bölümü yazma. JSON:
{
  "title": "string",
  "spot": "string",
  "summary": "string",
  "content": "string",
  "seoTitle": "string",
  "seoDescription": "string"
}`
}

async function callDeepSeek(input: WriterInput): Promise<WrittenArticle | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null

  const model =
    input.model?.trim() ||
    process.env.DEEPSEEK_NEWS_MODEL?.trim() ||
    'deepseek-chat'

  // Persona (Admin'de bir kez girilen core+news) esas; eski 500 kelime/essay kuralları yok
  const systemContent = input.systemPromptOverride?.trim()
    ? `${input.systemPromptOverride.trim()}\n\n${HARD_RULES}`
    : `${DEFAULT_NEWS_SYSTEM}\n\n${HARD_RULES}`

  const userContent = input.userPromptOverride?.trim()
    ? `${input.userPromptOverride.trim()}\n\n${buildPrompt(input)}`
    : buildPrompt(input)

  const messages = [
    { role: 'system' as const, content: systemContent },
    { role: 'user' as const, content: userContent },
  ]

  try {
    let res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages,
      }),
      signal: AbortSignal.timeout(35_000),
    })

    if (res.status === 429) {
      console.warn('[stage1/deepseek] 429, 3s retry')
      await new Promise((r) => setTimeout(r, 3000))
      res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: AbortSignal.timeout(35_000),
      })
    }

    if (!res.ok) {
      console.error('[stage1/deepseek] HTTP', res.status)
      return null
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<WrittenArticle>
    const title = String(parsed.title ?? '').trim()
    const body = String(parsed.content ?? '').trim()
    if (!title || !body) return null

    return {
      title,
      spot: String(parsed.spot ?? '').trim(),
      summary: String(parsed.summary ?? '').trim(),
      content: body,
      seoTitle: String(parsed.seoTitle ?? title).trim(),
      seoDescription: String(parsed.seoDescription ?? '').trim(),
      aiWritten: true,
    }
  } catch (err) {
    console.error('[stage1/deepseek]', err instanceof Error ? err.message : err)
    return null
  }
}

export async function writeArticle(input: WriterInput): Promise<WrittenArticle> {
  console.log(`[stage1/contentWriter] başlıyor: "${input.originalTitle.slice(0, 60)}"`)
  const written = await callDeepSeek(input)
  if (written) {
    console.log(`[stage1] DeepSeek başarılı: "${written.title.slice(0, 60)}"`)
    return written
  }

  console.warn(`[stage1] DeepSeek başarısız — ham fallback: "${input.originalTitle.slice(0, 60)}"`)
  const fallback = (input.originalContent || input.originalSummary || input.originalTitle).trim()
  return {
    title: input.originalTitle.slice(0, 70),
    spot: (input.originalSummary || '').slice(0, 400),
    summary: (input.originalSummary || input.originalTitle).slice(0, 120),
    content: fallback.slice(0, 800),
    seoTitle: input.originalTitle.slice(0, 65),
    seoDescription: (input.originalSummary || input.originalTitle).slice(0, 160),
    aiWritten: false,
  }
}
