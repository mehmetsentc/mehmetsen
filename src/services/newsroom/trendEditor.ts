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

  const today = new Date().toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const systemPrompt = `Sen NaHaber adlı Türkçe haber platformunun trend editörüsün. Bugünün tarihi: ${today}.

Görevin: Google Trends Türkiye'de zirveye oturan bir konu hakkında, NEDEN bu konunun tam şu an gündemde olduğunu açıklayan kapsamlı bir araştırma haberi yazmak.

ZORUNLU YAPI:
1. **Kim/Ne?** — Konuyu 1-2 cümleyle tanıt. İlk kez duyan okuyucu da anlasın.
2. **Neden Şimdi?** — Bu konunun BU HAFTA veya BUGÜN gündemde olmasının somut nedeni ne? (bir olay, açıklama, kaza, ödül, tartışma, müsabaka, skandal, ölüm, seçim, piyasa hareketi vb.)
3. **Sosyal Medya Yansıması** — İnsanlar bu konuyu nasıl konuşuyor? Hangi tepkiler ön plana çıktı?
4. **Arka Plan** — Konunun daha iyi anlaşılması için gerekli bağlam (tarihçe, benzer olaylar).
5. **Ne Olacak?** — Konunun seyri ne yönde gidebilir? Yaklaşan önemli bir tarih/karar var mı?

YAZIM KURALLARI:
- Başlık "X Neden Gündemde?" formatı olabilir ama daha özgün tercih et ("X Neden Yükselişe Geçti?", "X Neden Herkesin Dilinde?")
- Kesinlikle gerçek olmayan bilgi uydurma. Emin olmadığın noktalarda "iddialar yoğunlaşıyor", "öne sürülüyor" gibi ihtiyatlı dil kullan.
- Tarafsız, profesyonel Türkçe gazetecilik dili
- content: 5-7 paragraf, her paragraf min 2 cümle (toplam 250-450 kelime)
- summary: Konunun neden gündemde olduğunu tek cümlede anlatan, merak uyandıran özet (max 130 karakter)

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
            content: `Trend konusu: "${topic}"\n\nBu konu ${today} tarihi itibarıyla Türkiye'de Google'ın en çok aranan konuları arasına girdi.\n\nEğitim verilerini ve bilgi tabanını kullanarak:\n1. Bu konunun tam şu an neden gündemde olduğunu araştır\n2. Olası tetikleyici olayı tespit et (haber, olay, açıklama, tartışma vs.)\n3. Yukarıdaki yapıya uygun kapsamlı bir "neden trend?" haberi yaz\n\nEmin olmadığın konularda spekülatif dil kullan, kesinlikle gerçek dışı bilgi yazma.`,
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
