/**
 * Influencer Editor — OpenAI research scaffold from configured influencer list.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { processNewsroomArticle } from '@/services/newsroom/pipeline'
import { getInfluencerList, MAX_AI_CALLS_PER_EDITOR } from '@/services/newsroom/config'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'
import { recordDirectDeepSeekObservation } from '@/lib/ai/deepseekClient'
import { isLegacyDirectAiEnabled } from '@/services/crawler/legacyFlags'

async function researchInfluencer(name: string): Promise<{
  title: string
  summary: string
  content: string
}> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'

  if (!apiKey) {
    return {
      title: `${name} gündemde`,
      summary: `${name} hakkında son gelişmeler takip ediliyor.`,
      content: `${name} sosyal medyada ve magazin gündeminde yer alıyor. Detaylar doğrulanıyor.`,
    }
  }

  const startedAt = Date.now()
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
      messages: [
        {
          role: 'system',
          content: `Sen NaHaber influencer editörüsün. Verilen kişi hakkında kamuya açık, spekülasyonsuz kısa bir magazin/gündem özeti yaz.
Yalnızca doğrulanabilir genel bilgiler; dedikodu uydurma.
JSON: {"title":"...","summary":"...","content":"..."}`,
        },
        { role: 'user', content: `Influencer/ünlü: ${name}` },
      ],
    }),
  })

  if (!res.ok) {
    recordDirectDeepSeekObservation({
      agentName: 'influencer_editor',
      operation: 'research_influencer',
      promptVersion: 'influencer-editor:v1',
      model,
      startedAt,
      success: false,
      statusCode: res.status,
    })
    return {
      title: `${name} gündemde`,
      summary: `${name} hakkında haberler.`,
      content: `${name} medyada gündemde.`,
    }
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: unknown
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  recordDirectDeepSeekObservation({
    agentName: 'influencer_editor',
    operation: 'research_influencer',
    promptVersion: 'influencer-editor:v1',
    model,
    startedAt,
    success: Boolean(content),
    statusCode: 200,
    body: json,
    errorMessage: content ? undefined : 'empty_content',
  })
  if (!content) {
    return { title: `${name} gündemde`, summary: name, content: name }
  }

  try {
    const parsed = JSON.parse(content) as { title?: string; summary?: string; content?: string }
    return {
      title: parsed.title?.trim() || `${name} gündemde`,
      summary: parsed.summary?.trim() || name,
      content: parsed.content?.trim() || parsed.summary?.trim() || name,
    }
  } catch {
    return { title: `${name} gündemde`, summary: name, content: name }
  }
}

export const influencerEditor = {
  async run(maxAiCalls = Math.min(MAX_AI_CALLS_PER_EDITOR, 4)): Promise<NewsroomRunResult> {
    const started = Date.now()
    const result = emptyNewsroomResult('influencer')
    result.mode = isLegacyDirectAiEnabled() ? 'legacy_ai' : 'legacy_disabled'
    result.aiRequests = 0
    if (!isLegacyDirectAiEnabled()) {
      result.durationMs = Date.now() - started
      return result
    }
    const db = getAdminFirestore()
    const influencers = getInfluencerList()

    result.sourcesChecked = 1
    result.itemsFetched = influencers.length

    let aiCalls = 0
    for (const name of influencers) {
      if (aiCalls >= maxAiCalls) {
        result.errors.push(`AI call cap (${maxAiCalls}) reached`)
        break
      }

      const generated = await researchInfluencer(name)
      aiCalls += 1

      const fingerprint = `influencer:${name.toLowerCase().replace(/\s+/g, '-')}:${new Date().toISOString().slice(0, 10)}`
      const { outcome, lowConfidence } = await processNewsroomArticle(db, {
        editorId: 'influencer',
        editorType: 'influencer',
        sourceLabel: 'NaHaber Influencer Desk',
        sourceUrl: `https://nahaber.app/influencer/${encodeURIComponent(name)}`,
        originalTitle: generated.title,
        originalSummary: generated.summary,
        originalContent: generated.content,
        rssFingerprint: fingerprint,
        rssGuid: fingerprint,
        ingestionSourceId: 'influencer-desk',
        forcedCategoryId: 'influencer',
        extraTags: ['influencer', name.toLowerCase().replace(/\s+/g, '-')],
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
