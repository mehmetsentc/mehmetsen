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

async function generateTrendArticle(topic: string): Promise<{
  title: string
  summary: string
  content: string
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_NEWS_MODEL?.trim() || 'gpt-4o-mini'

  const fallback = {
    title: `${topic} neden gündemde?`,
    summary: `"${topic}" Türkiye'de en çok aranan konular arasına girdi. Peki bu isim ya da konu ne için öne çıkıyor?`,
    content: `"${topic}" son saatlerde Türkiye'nin gündemine oturdu ve arama motorlarında üst sıralara taşındı.\n\nKullanıcıların yoğun ilgisi, konunun sosyal medyada da hızla yayılmasına neden oldu. Henüz resmi bir açıklama yapılmamış olsa da çeşitli platformlarda bu isim ya da başlıkla ilgili tartışmalar sürüyor.\n\nNaHaber, konuyla ilgili gelişmeleri takip etmeye devam edecek.`,
  }

  if (!apiKey) return fallback

  const systemPrompt = `Sen NaHaber adlı Türkçe haber platformunun trend editörüsün.

Görevin: Verilen trend konusu hakkında, eğitim verilerine dayanarak kapsamlı bir "Neden trend?" haberi yazmak.

YAZIM KURALLARI:
- Bu kişi/konu kim/ne? Kısaca tanıt (sporcu, politikacı, dizi karakteri, teknoloji, olay vb.)
- Neden ŞU AN gündemde olabilir? Bilinen son gelişmeler, yaklaşan etkinlikler, tartışmalar
- Sosyal medyada ne konuşuluyor? Nasıl bir ilgi var?
- Tarafsız, profesyonel Türkçe gazetecilik dili kullan
- "gündemde" veya "trend" kelimelerini içerik başına koyma
- content: 4-6 paragraf, her paragraf en az 2 cümle (toplam 200-400 kelime)
- summary: 1 vurucu cümle, title'dan farklı, merak uyandıran (max 120 karakter)
- title: "X Neden Gündemde?" yerine daha özgün bir başlık tercih et

Yanıtı YALNIZCA geçerli JSON olarak ver:
{"title":"...","summary":"...","content":"..."}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.65,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Trend konusu: "${topic}"\n\nBu konu hakkında bildiklerini kullanarak neden gündemde olduğunu açıklayan kapsamlı bir haber yaz. Bilmiyorsan tahmin et ve belirt.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    })

    if (!res.ok) {
      console.warn(`[trendEditor] OpenAI ${res.status} for topic: ${topic}`)
      return fallback
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return fallback

    const parsed = JSON.parse(raw) as { title?: string; summary?: string; content?: string }
    const title = parsed.title?.trim() || `${topic} neden gündemde?`
    const summary = parsed.summary?.trim() || fallback.summary
    const content = parsed.content?.trim() || ''

    // If content is too thin (AI returned minimal output), use fallback
    if (content.length < 150) return { title, summary, content: fallback.content }

    return { title, summary, content }
  } catch (err) {
    console.error('[trendEditor] generateTrendArticle failed:', err)
    return fallback
  }
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
