/**
 * STAGE 1 — Content Writer
 *
 * Tek sorumluluğu: Ham RSS içeriğini profesyonel Türkçe gazete haberine dönüştürmek.
 * Kategori, son-dakika kararı VERMEZ — sadece içerik yazar.
 * Yalnızca DeepSeek kullanır.
 */

export interface WrittenArticle {
  title: string
  spot: string       // gazetecilik girişi, 2-4 cümle
  summary: string    // feed teaser, max 120 karakter
  content: string    // tam haber gövdesi, min 200 kelime
  seoTitle: string
  seoDescription: string
  /** true = AI yazdı, false = ham RSS fallback (yayınlanmaz) */
  aiWritten: boolean
}

interface WriterInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  /** Optional persona constitution + task instructions (V2) */
  systemPromptOverride?: string
  /** Optional user-message prefix (source already in buildPrompt) */
  userPromptOverride?: string
  model?: string
}

const SYSTEM_PROMPT = `Sen NaHaber'in içerik editörüsün. Görevin: verilen ham haberi profesyonel Türkçe gazete haberine dönüştürmek.

MUTLAK KURALLAR:
- Kaynak metinde OLMAYAN hiçbir bilgi, istatistik, kişi, alıntı EKLEME
- İçerik yetersizse qualityScore 0-30 ver — yeterli içerik olmadan uzun haber YAZMA
- Kaynak gazete/ajans adını (AA, DHA, İHA, Hürriyet vb.) içeriğe YAZMA
- Başlıkta BÜYÜK HARF spam, "FLAŞ", "SON DAKİKA" yazma
- Paragraflar arası \\n\\n kullan
- ÇIKTI DİLİ: Her zaman Türkçe

ALAN TANIMLARI:
- title: Gazete manşeti, max 70 karakter, sadece ilk harf büyük
- spot: Lider paragraf. Kim+Ne+Nerede+Ne zaman+Neden. 3-5 cümle, 80-150 kelime
- summary: Feed teaser, max 120 karakter, title'dan FARKLI bilgi
- content: Haber gövdesi, MİNİMUM 500 KELIME. Bölümleri ## H2 ve ### H3 markdown başlıklarıyla ayır.
  Bu yapı TÜM kategoriler ve alt kategoriler için aynıdır (gündem, spor/futbol, teknoloji, kültür/sinema, sağlık, magazin, dünya, yerel-haber, gezi vb.).
  Sayfa başlığı H1 olduğu için content içinde # H1 KULLANMA. Her bölüm için anlamlı ## başlıklar kullan.
  Paragraflar arası boş satır (\\n\\n) kullan. 6-8 paragraf + 3-5 başlık hedefle.
  İçeriği zenginleştirmek için: olayın arka planını, önemini, etkilenecek tarafları, uzman görüşleri (kaynak metinde varsa) ve tarihsel bağlamı (kaynak metinde varsa) ekle.
  500 kelime altındaki içerikler KABUL EDİLMEZ.
- seoTitle: SEO başlık, 55-65 karakter
- seoDescription: Meta description, 145-160 karakter

ÇIKTI: Yalnızca geçerli JSON, başka hiçbir şey:`

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

HATIRLATMA: content alanı minimum 500 kelime olmalı. Haberi genişlet, arka planını açıkla, bağlamı ve önemini belirt.

Haberi yaz. JSON formatı:
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
  const systemContent = input.systemPromptOverride?.trim()
    ? `${input.systemPromptOverride.trim()}\n\n${SYSTEM_PROMPT}`
    : SYSTEM_PROMPT
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
        temperature: 0.5,
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
          temperature: 0.5,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: AbortSignal.timeout(35_000),
      })
    }

    if (!res.ok) {
      console.warn(`[stage1/deepseek] error ${res.status}`)
      return null
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null

    const p = JSON.parse(raw) as {
      title?: string; spot?: string; summary?: string
      content?: string; seoTitle?: string; seoDescription?: string
    }

    const content = p.content?.trim() || ''
    const wordCount = content.split(/\s+/).filter(Boolean).length
    if (wordCount < 400) {
      console.warn(`[stage1/deepseek] çok kısa içerik (${wordCount} kelime, min 400)`)
      return null
    }

    return {
      title: p.title?.trim() || input.originalTitle,
      spot: p.spot?.trim() || '',
      summary: (p.summary?.trim() || '').slice(0, 150),
      content,
      seoTitle: (p.seoTitle?.trim() || p.title?.trim() || input.originalTitle).slice(0, 70),
      seoDescription: (p.seoDescription?.trim() || p.summary?.trim() || '').slice(0, 165),
      aiWritten: true,
    }
  } catch (err) {
    console.warn('[stage1/deepseek] exception:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Stage 1 ana fonksiyon.
 * DeepSeek → ham fallback (aiWritten: false)
 */
export async function writeArticle(input: WriterInput): Promise<WrittenArticle> {
  console.log(`[stage1/contentWriter] başlıyor: "${input.originalTitle.slice(0, 60)}"`)

  const deepseekResult = await callDeepSeek(input)
  if (deepseekResult) {
    console.log(`[stage1] DeepSeek başarılı: "${deepseekResult.title.slice(0, 60)}"`)
    return deepseekResult
  }

  // Ham fallback — aiWritten: false → pipeline taslağa alır
  console.warn(`[stage1] DeepSeek başarısız — ham fallback: "${input.originalTitle.slice(0, 60)}"`)
  const rawContent = (input.originalContent || input.originalSummary || '').slice(0, 800)
  return {
    title: input.originalTitle,
    spot: input.originalSummary || '',
    summary: (input.originalSummary || '').slice(0, 120),
    content: rawContent,
    seoTitle: input.originalTitle.slice(0, 70),
    seoDescription: (input.originalSummary || '').slice(0, 165),
    aiWritten: false,
  }
}
