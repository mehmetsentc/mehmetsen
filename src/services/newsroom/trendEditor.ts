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

  if (!apiKey) {
    return {
      title: `${topic} neden trend?`,
      summary: `${topic} şu an gündemde. Detaylar gelişiyor.`,
      content: `${topic} konusu Türkiye'de ve dünyada yoğun ilgi görüyor. Kullanıcılar arama motorlarında bu başlığı araştırıyor.`,
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Sen NaHaber trend editörüsün. Verilen konu için "Neden trend?" formatında kısa bir haber taslağı üret.
JSON: {"title":"...","summary":"...","content":"..."}
Başlık: "X neden trend?" veya benzeri. 2-3 paragraf, tarafsız Türkçe.`,
        },
        { role: 'user', content: `Trend konusu: ${topic}` },
      ],
    }),
  })

  if (!res.ok) {
    return {
      title: `${topic} neden trend?`,
      summary: `${topic} gündemde.`,
      content: `${topic} hakkında kullanıcı ilgisi artıyor.`,
    }
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) {
    return { title: `${topic} neden trend?`, summary: topic, content: topic }
  }

  try {
    const parsed = JSON.parse(content) as { title?: string; summary?: string; content?: string }
    return {
      title: parsed.title?.trim() || `${topic} neden trend?`,
      summary: parsed.summary?.trim() || topic,
      content: parsed.content?.trim() || parsed.summary?.trim() || topic,
    }
  } catch {
    return { title: `${topic} neden trend?`, summary: topic, content: topic }
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
