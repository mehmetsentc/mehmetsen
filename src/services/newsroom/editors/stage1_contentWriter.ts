/**
 * STAGE 1 — Content Writer
 *
 * Ham RSS → profesyonel Türkçe gazete haberi.
 * Persona (V2) varsa onun constitution/task prompt'u esas alınır;
 * burada yalnızca sabit güvenlik + haber biçimi kuralları eklenir.
 */

import { contentHasIncompleteSegments, titleLooksIncomplete } from '@/lib/ai/textCompleteness'
import { countPlainWords, isNewsBodyTooShort, MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'

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
  /** Gate / QC notları — yeniden yazımda düzeltilecek noktalar */
  revisionHints?: string[]
  previousDraft?: { title: string; spot: string; content: string }
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
- content: 250-450 kelime hedef (asgari ~220); gereksiz nutuk/doldurma YASAK
- En fazla 1-2 ## başlık; yalnızca olay-özgü (ör. "Ceza tutarı", "Resmi açıklama")
- YASAK başlıklar: "Sonuç", "Giriş", "Gelişme", "Önemi", "Biyolojik Çeşitliliğin Korunması", "Genel Değerlendirme" ve benzeri ders kitabı / ansiklopedi başlıkları
- YASAK: uzun genel bilgi paragrafları, ahlak dersi, "bu nedenle vatandaşların…" nutukları
- Kaynak inceyse bile olgusal bağlam ve arka planla anlamlı gövde yaz; uydurma yok

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

  let revisionBlock = ''
  if (input.revisionHints?.length || input.previousDraft) {
    const hints = (input.revisionHints ?? []).map((h) => `- ${h}`).join('\n')
    const prev = input.previousDraft
    revisionBlock = `

YENİDEN DÜZENLEME GÖREVİ:
Önceki taslak kalite kapısından geçmedi. Aynı olay için DAHA İYİ bir gazete haberi yaz.
${hints ? `Düzeltilecek noktalar:\n${hints}` : ''}
${prev ? `Önceki başlık: ${prev.title}\nÖnceki spot: ${prev.spot.slice(0, 400)}\nÖnceki gövde (özet):\n${prev.content.slice(0, 2500)}` : ''}
- Gövdeyi en az 220 kelime yap (hedef 280-450); yarım cümle bırakma
- Kaynakta olmayan bilgi uydurma
- Önceki taslağın hatalarını tekrarlama
`
  }

  return `${sourceNote}
Başlık: ${input.originalTitle}
Özet: ${input.originalSummary || ''}
İçerik:
${content.slice(0, 6000)}
${revisionBlock}
GAZETE HABERİ yaz (ters piramit). Ansiklopedi / "Sonuç" bölümü yazma.
content gövdesi ZORUNLU en az 220 kelime (hedef 250-450); spot'u tekrarlama; olgu+bağlam+arka plan.
JSON:
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

  const { deepseekChatCompletion, getDeepSeekModel } = await import('@/lib/ai/deepseekClient')
  const model = getDeepSeekModel(input.model)

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

  // 50s timeout: stage1 × 2 (incomplete retry) + stage3 = ~130s per article, well under 200s budget
  const timeoutMs = Number(process.env.DEEPSEEK_WRITER_TIMEOUT_MS ?? 50_000)

  try {
    let raw: string
    try {
      raw = await deepseekChatCompletion({
        model,
        messages,
        temperature: 0.4,
        maxTokens: 3500,
        timeoutMs,
        disableThinking: true,
        jsonMode: true,
        telemetry: {
          agentName: 'stage1_writer',
          operation: 'generate_article',
          promptVersion: 'stage1-writer:v1',
          attempt: 1,
        },
      })
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (!/HTTP 429|boş yanıt|0 karakter/i.test(msg)) {
        console.error('[stage1/deepseek]', msg)
        return null
      }
      console.warn('[stage1/deepseek] retry after', msg.slice(0, 80))
      await new Promise((r) => setTimeout(r, 3000))
      raw = await deepseekChatCompletion({
        model,
        messages,
        temperature: 0.4,
        maxTokens: 3500,
        timeoutMs,
        disableThinking: true,
        jsonMode: true,
        telemetry: {
          agentName: 'stage1_writer',
          operation: 'generate_article',
          promptVersion: 'stage1-writer:v1',
          attempt: 2,
          retryCount: 1,
        },
      })
    }

    let parsed: Partial<WrittenArticle>
    try {
      let jsonStr = raw
      const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fence) jsonStr = fence[1]!.trim()
      if (!jsonStr.startsWith('{')) {
        const obj = jsonStr.match(/\{[\s\S]*\}/)
        if (obj) jsonStr = obj[0]
      }
      parsed = JSON.parse(jsonStr) as Partial<WrittenArticle>
    } catch {
      console.error('[stage1/deepseek] JSON parse failed')
      return null
    }

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

function writtenLooksIncomplete(w: WrittenArticle): boolean {
  return (
    titleLooksIncomplete(w.title) ||
    contentHasIncompleteSegments(w.spot || '') ||
    contentHasIncompleteSegments(w.summary || '') ||
    contentHasIncompleteSegments(w.content || '') ||
    isNewsBodyTooShort(w.content)
  )
}

export async function writeArticle(input: WriterInput): Promise<WrittenArticle> {
  console.log(`[stage1/contentWriter] başlıyor: "${input.originalTitle.slice(0, 60)}"`)
  let written = await callDeepSeek(input)

  // Yarım / kısa çıktı → bir kez daha yaz (onay kuyruğuna yarım metin basmamak için)
  if (written && writtenLooksIncomplete(written)) {
    console.warn('[stage1] yarım/kısa çıktı — tamamlamak için yeniden yazılıyor')
    const repaired = await callDeepSeek({
      ...input,
      revisionHints: [
        ...(input.revisionHints ?? []),
        'Önceki çıktı YARIM KESİLMİŞ — tüm alanları (title, spot, summary, content) eksiksiz tamamla',
        'Hiçbir cümleyi ortada bırakma; spot ve content nokta ile bitsin',
        `content en az ${MIN_NEWS_BODY_WORDS} kelime olsun`,
      ],
      previousDraft: {
        title: written.title,
        spot: written.spot,
        content: written.content,
      },
    })
    if (repaired && !writtenLooksIncomplete(repaired)) {
      written = repaired
    } else if (repaired && countPlainWords(repaired.content) > countPlainWords(written.content)) {
      written = repaired
    }
  }

  if (written) {
    console.log(`[stage1] DeepSeek başarılı: "${written.title.slice(0, 60)}"`)
    return written
  }

  console.warn(`[stage1] DeepSeek başarısız — ham fallback: "${input.originalTitle.slice(0, 60)}"`)
  // Ortadan kesme — son cümle sonuna kadar al (onay kuyruğuna “…canlarını” gibi yarım spot basmamak için)
  const cutAtSentence = (text: string, max: number) => {
    const t = text.trim()
    if (t.length <= max) return t
    const slice = t.slice(0, max)
    const lastStop = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'))
    if (lastStop > max * 0.4) return slice.slice(0, lastStop + 1).trim()
    const lastSpace = slice.lastIndexOf(' ')
    return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim()
  }
  const fallback = (input.originalContent || input.originalSummary || input.originalTitle).trim()
  const spotSrc = (input.originalSummary || '').trim()
  return {
    title: input.originalTitle.slice(0, 70),
    spot: cutAtSentence(spotSrc, 400),
    summary: cutAtSentence(input.originalSummary || input.originalTitle, 120),
    content: cutAtSentence(fallback, 800),
    seoTitle: input.originalTitle.slice(0, 65),
    seoDescription: cutAtSentence(input.originalSummary || input.originalTitle, 160),
    aiWritten: false,
  }
}
