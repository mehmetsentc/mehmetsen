/**
 * Fact Checker — pipeline stage wrapping all editors.
 * Scores confidence 0–100; flags low-confidence drafts for admin review.
 */
import type { AiRewriteResult } from '@/services/aiNewsEditor'
import { recordDirectDeepSeekObservation } from '@/lib/ai/deepseekClient'

export interface FactCheckInput {
  sourceLabel: string
  sourceUrl: string
  originalTitle: string
  originalSummary: string
  /** Full source body when available — preferred over summary-only checks. */
  originalContent?: string
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
  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
  return { apiKey, model }
}

function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).slice(0, 40)
}

function heuristicFactCheck(input: FactCheckInput): FactCheckResult {
  const flags: string[] = ['factcheck_heuristic']
  let score = 55

  const sourceBody = (input.originalContent || input.originalSummary || '').trim()
  const origLen = sourceBody.length + input.originalTitle.length
  const newLen = input.rewritten.description.length + input.rewritten.title.length

  if (newLen < origLen * 0.3 && origLen > 200) {
    flags.push('rewrite_too_short')
    score -= 15
  }

  if (input.rewritten.title.toLowerCase() === input.originalTitle.toLowerCase()) {
    flags.push('title_unchanged')
    score -= 8
  }

  const sourceNumbers = new Set(extractNumbers(sourceBody))
  const rewriteNumbers = extractNumbers(input.rewritten.description)
  if (rewriteNumbers.length > 0 && sourceNumbers.size > 0) {
    const unsupported = rewriteNumbers.filter((n) => !sourceNumbers.has(n))
    if (unsupported.length >= 3) {
      flags.push('unsupported_claims')
      score -= 20
    }
  }

  if (sourceBody.length > 400 && input.rewritten.description.length > sourceBody.length * 2.2) {
    flags.push('thin_vs_source')
    score -= 12
  }

  const combined = `${input.rewritten.title} ${input.rewritten.description}`.toLowerCase()
  for (const kw of URGENCY_KEYWORDS) {
    if (combined.includes(kw)) {
      score += 3
      break
    }
  }

  return {
    confidenceScore: Math.min(100, Math.max(0, score)),
    flags,
  }
}

async function deepSeekFactCheck(input: FactCheckInput): Promise<FactCheckResult> {
  const config = getDeepSeekConfig()
  if (!config) return heuristicFactCheck(input)

  const useFullSource = process.env.NEWSROOM_FACTCHECK_FULL_SOURCE !== '0'
  const sourceBody = useFullSource
    ? (input.originalContent || input.originalSummary || '').slice(0, 8000)
    : input.originalSummary.slice(0, 800)

  const startedAt = Date.now()
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
        thinking: { type: 'disabled' },
      messages: [
        {
          role: 'system',
          content: `Sen bir haber doğruluk denetçisisin. Kaynak haber ile yeniden yazılmış metni karşılaştır.
Yanıtı YALNIZCA JSON ver:
{"confidenceScore":0-100,"flags":["..."]}
confidenceScore: yeniden yazımın kaynakla tutarlılığı, spekülasyon yokluğu, sayı/isim/alıntı korunumu.
flags: speculation, missing_attribution, title_mismatch, thin_rewrite, unsupported_claims.
Kaynakta olmayan sayı, kişi adı, alıntı veya nedensellik varsa unsupported_claims ekle ve skoru düşür.`,
        },
        {
          role: 'user',
          content: `Kaynak: ${input.sourceLabel}
URL: ${input.sourceUrl}
Orijinal başlık: ${input.originalTitle}
Orijinal içerik:
${sourceBody}
---
Yeniden yazılmış başlık: ${input.rewritten.title}
Yeniden yazılmış metin: ${input.rewritten.description.slice(0, 2500)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) {
    recordDirectDeepSeekObservation({
      agentName: 'fact_checker',
      operation: 'fact_check',
      promptVersion: 'fact-checker:v1',
      model: config.model,
      startedAt,
      success: false,
      statusCode: res.status,
    })
    console.warn('[factChecker] DeepSeek error, using heuristic')
    return heuristicFactCheck(input)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: unknown
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  recordDirectDeepSeekObservation({
    agentName: 'fact_checker',
    operation: 'fact_check',
    promptVersion: 'fact-checker:v1',
    model: config.model,
    startedAt,
    success: Boolean(content),
    statusCode: 200,
    body: json,
    errorMessage: content ? undefined : 'empty_content',
  })
  if (!content) return heuristicFactCheck(input)

  try {
    const parsed = JSON.parse(content) as { confidenceScore?: number; flags?: string[] }
    const score = Math.min(100, Math.max(0, Number(parsed.confidenceScore) || 60))
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
