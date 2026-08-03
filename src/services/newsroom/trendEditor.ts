/**
 * Trend Editor — Google Trends RSS (or configured topics) + OpenAI "Neden trend?" format.
 * Functional scaffold with real OpenAI output.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import { getTrendTopics, MAX_AI_CALLS_PER_EDITOR } from '@/services/newsroom/config'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'
import { researchLiveNews, type GroundingSource } from '@/lib/ai/liveResearch'

const GOOGLE_TRENDS_RSS =
  process.env.NEWSROOM_TRENDS_RSS_URL?.trim() ||
  'https://trends.google.com/trending/rss?geo=TR'

interface TrendTopic {
  title: string
  traffic?: string
  link?: string
}

async function fetchTrendTopics(): Promise<TrendTopic[]> {
  try {
    const res = await fetch(GOOGLE_TRENDS_RSS, {
      headers: { 'User-Agent': 'NaHaber-Newsroom/1.0' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()
    const items: TrendTopic[] = []
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []
    for (const block of itemBlocks.slice(0, 8)) {
      const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim()
      const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim()
      if (title) items.push({ title, link })
    }
    if (items.length > 0) return items
  } catch (error) {
    console.warn('[trendEditor] Google Trends RSS failed, using configured topics:', error)
  }

  return getTrendTopics().map((title) => ({ title }))
}

/**
 * Trend makalesi üretir.
 * Gemini Google Search grounding ile araştırır; DeepSeek yalnızca kaynaklı
 * araştırma notlarından yayın metnini üretir.
 */
async function generateTrendArticle(topic: string): Promise<{
  title: string
  summary: string
  content: string
  category: string
  researchSources: GroundingSource[]
} | null> {
  const today = new Date().toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const SYSTEM_PROMPT = `Sen NaHaber adlı Türkçe haber platformunun trend editörüsün. Bugünün tarihi: ${today}.

Görevin: Google Trends Türkiye'de zirveye oturan bir konu hakkında, NEDEN bu konunun tam şu an gündemde olduğunu açıklayan kapsamlı bir araştırma haberi yazmak.

MUTLAK KURAL: Eğer konunun neden gündemde olduğunu kesin olarak bilmiyorsan, makale yazma. "Belirtilmedi", "henüz açıklanmadı", "takip etmeye devam edeceğiz" gibi dolgu cümleler YASAK.

ZORUNLU YAPI:
1. Kim/Ne? — Konuyu 1-2 cümleyle tanıt.
2. Neden Şimdi? — Bu konunun BUGÜN gündemde olmasının somut nedeni (olay, açıklama, kaza, ödül, tartışma, maç, skandal).
3. Sosyal Medya Yansıması — İnsanların tepkileri.
4. Arka Plan — Bağlam ve tarihçe.
5. Ne Olacak? — Yaklaşan gelişmeler.

YAZIM KURALLARI:
- Başlık özgün olsun: "X Neden Yükselişe Geçti?", "X Neden Herkesin Dilinde?" vb.
- Gerçek olmayan bilgi uydurma. Emin olmadığın yerde "iddialar yoğunlaşıyor" gibi ihtiyatlı dil kullan.
- Türkçe, tarafsız, profesyonel gazetecilik dili
- content: 5-7 paragraf, 250-450 kelime
- summary: max 130 karakter, merak uyandıran

KATEGORİ SEÇİMİ (category alanı zorunlu):
Haberin içeriğine göre EN UYGUN kategoriyi seç:
- futbol → futbol maçı, gol, transfer, teknik direktör, Süper Lig, Şampiyonlar Ligi
- basketbol → NBA, EuroLeague, basketbol maçı/transfer
- voleybol → voleybol maçı, Efeler/Sultanlar Ligi, milli voleybol
- spor → diğer spor dalları (F1, tenis, boks, yüzme, atletizm vb.)
- magazin → ünlü özel hayatı, dizi/film oyuncusu, şarkıcı, ilişki, skandal
- kultur → dizi/film içeriği (oyuncu değil içerik), müzik albümü, festival, konser
- teknoloji → yapay zeka, uygulama, sosyal medya platform, telefon, oyun
- ekonomi → şirket, borsa, kripto, para birimi, ürün fiyatı
- saglik → hastalık, ilaç, sağlık uyarısı, pandemi
- siyaset → siyasetçi, seçim, meclis, parti
- dunya → Türkiye dışında gerçekleşen olay
- gundem → yukarıdakilere girmeyen genel Türkiye gündemi

Yanıtı YALNIZCA geçerli JSON olarak ver:
{"title":"...","summary":"...","content":"...","category":"gundem"}`

  const research = await researchLiveNews({
    query: `${topic} neden bugün gündemde ${today}`,
    context: `Google Trends Türkiye konusu: ${topic}`,
  })
  if (!research || research.sources.length < 2) {
    console.warn(`[trendEditor] yeterli canlı kaynak bulunamadı, konu atlanıyor: ${topic}`)
    return null
  }

  const USER_MSG = `Trend konusu: "${topic}"

CANLI GOOGLE ARAŞTIRMA NOTLARI:
${research.brief}

KAYNAKLAR:
${research.sources.map((source, index) => `[${index + 1}] ${source.title}: ${source.url}`).join('\n')}

Yalnızca yukarıdaki kaynaklı araştırmayı kullanarak bu konunun NEDEN bugün gündemde olduğunu anlatan kapsamlı haber yaz. Kaynaklarda bulunmayan bilgi ekleme.`

  // ── DeepSeek ile trend analizi ────────────────────────────────────────────
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
  const deepseekModel = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'

  if (deepseekKey) {
    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${deepseekKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: deepseekModel,
          temperature: 0.5,
          response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
          max_tokens: 2048,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: USER_MSG },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      })

      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const raw = json.choices?.[0]?.message?.content?.trim()
        if (raw) {
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
          const parsed = JSON.parse(cleaned) as { title?: string; summary?: string; content?: string; category?: string }
          const content = parsed.content?.trim() ?? ''
          if (content.length >= 200) {
            return {
              title:    parsed.title?.trim()    || `${topic} neden gündemde?`,
              summary:  parsed.summary?.trim()  || '',
              content,
              category: parsed.category?.trim() || 'gundem',
              researchSources: research.sources,
            }
          }
          console.warn(`[trendEditor] DeepSeek içerik çok kısa (${content.length} karakter), konu atlanıyor: ${topic}`)
          return null
        }
      } else {
        console.warn(`[trendEditor] DeepSeek ${res.status} for topic: ${topic}`)
      }
    } catch (err) {
      console.warn('[trendEditor] DeepSeek başarısız:', err)
    }
  }

  // AI başarısız → uydurma içerik YASAK, konuyu atla
  console.warn(`[trendEditor] DeepSeek başarısız, konu atlanıyor: ${topic}`)
  return null
}

export const trendEditor = {
  async run(maxAiCalls = Math.min(MAX_AI_CALLS_PER_EDITOR, 5)): Promise<NewsroomRunResult> {
    const started = Date.now()
    const result = emptyNewsroomResult('trend')
    const db = getAdminFirestore()

    const topics = await fetchTrendTopics()
    result.sourcesChecked = 1
    result.itemsFetched = topics.length

    let aiCalls = 0
    for (const topic of topics) {
      if (aiCalls >= maxAiCalls) {
        result.errors.push(`AI call cap (${maxAiCalls}) reached`)
        break
      }

      const generated = await generateTrendArticle(topic.title)
      aiCalls += 1

      // AI içerik üretemedi (uydurma fallback yok) → konuyu atla
      if (!generated) {
        result.itemsSkipped += 1
        continue
      }

      const fingerprint = `trend:${topic.title.toLowerCase().replace(/\s+/g, '-')}`
      console.log(`[trendEditor] "${generated.title}" → kategori: ${generated.category}`)

      const { outcome, lowConfidence } = await processNewsroomArticle(db, {
        editorId: 'trend',
        editorType: 'trend',   // ← trending badge için kalır
        sourceLabel: 'Google Search Grounding',
        sourceUrl: generated.researchSources[0]?.url
          ?? topic.link
          ?? `https://trends.google.com/trends/explore?q=${encodeURIComponent(topic.title)}`,
        originalTitle: generated.title,
        originalSummary: generated.summary,
        originalContent: generated.content,
        rssFingerprint: fingerprint,
        rssGuid: fingerprint,
        ingestionSourceId: 'google-trends',
        forcedCategoryId: generated.category,  // ← AI'ın belirlediği gerçek kategori
        extraTags: ['trending', 'trend'],
        researchSources: generated.researchSources,
        skipAiRewrite: true,
      })

      if (outcome === 'published') {
        result.itemsNew += 1
        result.autoPublished += 1
      } else if (outcome === 'created') {
        result.itemsNew += 1
        result.draftsCreated += 1
        if (lowConfidence) result.lowConfidence += 1
      } else if (outcome === 'skipped') {
        result.itemsSkipped += 1
      } else {
        result.itemsFailed += 1
      }
    }

    result.durationMs = Date.now() - started
    return result
  },
}
