/**
 * Fact Checker — pipeline stage wrapping all editors.
 * Scores confidence 0–100; flags low-confidence drafts for admin review.
 */
import type { AiRewriteResult } from '@/services/aiNewsEditor'

export interface FactCheckInput {
  sourceLabel: string
  sourceUrl: string
  originalTitle: string
  originalSummary: string
  rewritten: AiRewriteResult
}

export interface FactCheckResult {
  confidenceScore: number
  flags: string[]
}

const URGENCY_KEYWORDS = [
  'son dakika',
  'acil',
  'deprem',
  'patlama',
  'ölüm',
  'olum',
  'kriz',
  'skandal',
]

function getDeepSeekConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-chat'
  return { apiKey, model }
}

function heuristicFactCheck(input: FactCheckInput): FactCheckResult {
  const flags: string[] = []
  let score = 72

  const origLen = input.originalSummary.length + input.originalTitle.length
  const newLen = input.rewritten.description.length + input.rewritten.title.length

  if (newLen < origLen * 0.3 && origLen > 200) {
    flags.push('rewrite_too_short')
    score -= 15
  }

  if (input.rewritten.title.toLowerCase() === input.originalTitle.toLowerCase()) {
    flags.push('title_unchanged')
    score -= 8
  }

  const combined = `${input.rewritten.title} ${input.rewritten.description}`.toLowerCase()
  for (const kw of URGENCY_KEYWORDS) {
    if (combined.includes(kw)) {
      score += 5
      break
    }
  }

  // AI-rewritten content doesn't embed "kaynak:" inline — attribution is stored
  // in the article's source field, not body text. Skipping this penalty.

  return {
    confidenceScore: Math.min(100, Math.max(0, score)),
    flags,
  }
}

async function deepSeekFactCheck(input: FactCheckInput): Promise<FactCheckResult> {
  const config = getDeepSeekConfig()
  if (!config) return heuristicFactCheck(input)

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Sen bir haber doğruluk denetçisisin. Kaynak haber ile yeniden yazılmış metni karşılaştır.
Yanıtı YALNIZCA JSON ver:
{"confidenceScore":0-100,"flags":["..."]}
confidenceScore: yeniden yazımın kaynakla tutarlılığı, spekülasyon yokluğu, atıf varlığı.
flags: sorun varsa kısa İngilizce kodlar (speculation, missing_attribution, title_mismatch, thin_rewrite).`,
        },
        {
          role: 'user',
          content: `Kaynak: ${input.sourceLabel}
URL: ${input.sourceUrl}
Orijinal başlık: ${input.originalTitle}
Orijinal özet: ${input.originalSummary.slice(0, 800)}
---
Yeniden yazılmış başlık: ${input.rewritten.title}
Yeniden yazılmış metin: ${input.rewritten.description.slice(0, 1200)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    console.warn('[factChecker] DeepSeek error, using heuristic')
    return heuristicFactCheck(input)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) return heuristicFactCheck(input)

  try {
    const parsed = JSON.parse(content) as { confidenceScore?: number; flags?: string[] }
    const score = Math.min(100, Math.max(0, Number(parsed.confidenceScore) || 72))
    const flags = Array.isArray(parsed.flags) ? parsed.flags.map(String).filter(Boolean) : []
    return { confidenceScore: score, flags }
  } catch {
    return heuristicFactCheck(input)
  }
}

export const factChecker = {
  async check(input: FactCheckInput): Promise<FactCheckResult> {
    try {
      return await deepSeekFactCheck(input)
    } catch (error) {
      console.error('[factChecker] failed, heuristic fallback:', error)
      return heuristicFactCheck(input)
    }
  },
}
