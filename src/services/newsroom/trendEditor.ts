/**
 * Trend Editor — Google Trends RSS (or configured topics) + OpenAI "Neden trend?" format.
 * Functional scaffold with real OpenAI output.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import { getTrendTopics, MAX_AI_CALLS_PER_EDITOR } from '@/services/newsroom/config'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

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
 * Önce Gemini 2.0 Flash dener (ücretsiz, built-in Google Search ile güncel bilgi alır).
 * Gemini başarısız olursa OpenAI'ya düşer.
 * Her ikisi de yoksa/başarısız olursa null döner → konu atlanır (uydurma içerik YASAK).
 */
async function generateTrendArticle(topic: string): Promise<{
  title: string
  summary: string
  content: string
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

Yanıtı YALNIZCA geçerli JSON olarak ver:
{"title":"...","summary":"...","content":"..."}`

  const USER_MSG = `Trend konusu: "${topic}"

Bu konu ${today} tarihi itibarıyla Türkiye'de Google'ın en çok aranan konuları arasına girdi.

Google Search grounding aracını kullanarak bu konunun NEDEN bugün gündemde olduğunu araştır ve kapsamlı bir "neden trend?" haberi yaz. İçerik kısa veya belirsiz kalacaksa makale yazma, bunun yerine boş content döndür.`

  // ── 1. Gemini 2.0 Flash + built-in Google Search (ücretsiz, güncel bilgi) ─────
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  const geminiModel = 'gemini-2.0-flash'

  if (geminiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: USER_MSG }] }],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            tools: [{ googleSearch: {} }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
          }),
          signal: AbortSignal.timeout(30_000),
        }
      )

      if (geminiRes.ok) {
        const gData = (await geminiRes.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
        }
        const raw = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        if (cleaned.startsWith('{')) {
          const parsed = JSON.parse(cleaned) as { title?: string; summary?: string; content?: string }
          const content = parsed.content?.trim() ?? ''
          // 200 karakterden kısa içerik dolgu demektir → atla
          if (content.length >= 200) {
            return {
              title:   parsed.title?.trim()   || `${topic} neden gündemde?`,
              summary: parsed.summary?.trim() || '',
              content,
            }
          }
          console.warn(`[trendEditor] Gemini içerik çok kısa (${content.length} karakter), konu atlanıyor: ${topic}`)
          return null
        }
      } else {
        console.warn(`[trendEditor] Gemini ${geminiRes.status} for topic: ${topic}`)
      }
    } catch (err) {
      console.warn('[trendEditor] Gemini başarısız:', err)
    }
  }

  // ── 2. OpenAI fallback (Gemini yoksa) ─────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  const openaiModel = process.env.OPENAI_NEWS_MODEL?.trim() || 'gpt-4o-mini'

  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: openaiModel,
          temperature: 0.65,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: USER_MSG },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      })

      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
        const raw = json.choices?.[0]?.message?.content?.trim()
        if (raw) {
          const parsed = JSON.parse(raw) as { title?: string; summary?: string; content?: string }
          const content = parsed.content?.trim() ?? ''
          if (content.length >= 200) {
            return {
              title:   parsed.title?.trim()   || `${topic} neden gündemde?`,
              summary: parsed.summary?.trim() || '',
              content,
            }
          }
        }
      } else {
        console.warn(`[trendEditor] OpenAI ${res.status} for topic: ${topic}`)
      }
    } catch (err) {
      console.warn('[trendEditor] OpenAI başarısız:', err)
    }
  }

  // Her iki AI da başarısız → uydurma içerik YASAK, konuyu atla
  console.warn(`[trendEditor] AI yok veya başarısız, konu atlanıyor: ${topic}`)
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
      const { outcome, lowConfidence } = await processNewsroomArticle(db, {
        editorId: 'trend',
        editorType: 'trend',
        sourceLabel: 'Google Trends',
        sourceUrl: topic.link ?? `https://trends.google.com/trends/explore?q=${encodeURIComponent(topic.title)}`,
        originalTitle: generated.title,
        originalSummary: generated.summary,
        originalContent: generated.content,
        rssFingerprint: fingerprint,
        rssGuid: fingerprint,
        ingestionSourceId: 'google-trends',
        forcedCategoryId: 'trend',
        extraTags: ['trending', 'trend'],
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
