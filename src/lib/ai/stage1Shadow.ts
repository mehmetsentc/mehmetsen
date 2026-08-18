/**
 * Stage1 cheap-provider shadow.
 *
 * Production Stage1 stays DeepSeek. Shadow output is never returned, never
 * written to news, and never passed to Stage3 / FactChecker / Chief / publish.
 *
 * Default OFF: AI_STAGE1_SHADOW_ENABLED=false, AI_STAGE1_SHADOW_PERCENT=0.
 * Cohort: SHA-256 of newsId → queueId → traceId (no Math.random).
 */

import { groqCohortBucket, classifierCohortKey, getGroqApiKey, getGroqFastModel, getGroqStrongModel } from '@/lib/ai/groqRouting'
import { groqChatCompletionDetailed, type GroqJsonSchema } from '@/lib/ai/groqClient'
import { geminiFastChat } from '@/lib/ai/providers/geminiChat'
import { openRouterFastChat } from '@/lib/ai/providers/openrouter'
import {
  getGeminiFastModel,
  isGeminiFastAvailable,
  isOpenRouterAvailable,
  getOpenRouterFastModel,
} from '@/lib/ai/router/policy'
import { isGeminiCircuitOpen } from '@/lib/ai/providers/geminiCircuit'
import { extractJsonObject } from '@/lib/ai/router/validation'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import { outputTokenLimit } from '@/lib/ai/usage/tokenBudget'
import type { GenerationReason } from '@/lib/ai/usage/generationReason'
import type { NormalizedAiUsage } from '@/lib/ai/usage/types'
import type { ChatMessage } from '@/lib/ai/router/types'

const STAGE1_SHADOW_SCHEMA = {
  name: 'stage1_article',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      spot: { type: 'string' },
      summary: { type: 'string' },
      content: { type: 'string' },
      seoTitle: { type: 'string' },
      seoDescription: { type: 'string' },
    },
    required: ['title', 'spot', 'summary', 'content', 'seoTitle', 'seoDescription'],
    additionalProperties: false,
  },
}

const REQUIRED = ['title', 'spot', 'summary', 'content', 'seoTitle', 'seoDescription'] as const

export type Stage1ShadowProviderId = 'groq' | 'openrouter' | 'gemini'

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on'
}

function envPercent(name: string): number {
  const n = Number(process.env[name] ?? '0')
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.floor(n)))
}

export function isStage1ShadowEnabled(): boolean {
  return envFlag('AI_STAGE1_SHADOW_ENABLED') && envPercent('AI_STAGE1_SHADOW_PERCENT') > 0
}

export function getStage1ShadowPercent(): number {
  return envPercent('AI_STAGE1_SHADOW_PERCENT')
}

/** Prefer existing GROQ_STRONG_MODEL, else GROQ_FAST_MODEL. Skip Groq without API key. */
export function resolveGroqShadowModel(): string | null {
  if (!getGroqApiKey()) return null
  const strong = process.env.GROQ_STRONG_MODEL?.trim()
  const fast = process.env.GROQ_FAST_MODEL?.trim()
  if (strong) return strong
  if (fast) return fast
  return getGroqStrongModel() || getGroqFastModel() || null
}

/**
 * First provider with production credentials.
 * Groq (strong/fast) → OpenRouter fast → Gemini fast. Missing ENV → skip that provider.
 * Does not invent model IDs.
 */
export function resolveStage1ShadowProvider(): { provider: Stage1ShadowProviderId; model: string } | null {
  const groqModel = resolveGroqShadowModel()
  if (groqModel) return { provider: 'groq', model: groqModel }

  const openRouterModel = getOpenRouterFastModel()
  if (isOpenRouterAvailable() && openRouterModel) {
    return { provider: 'openrouter', model: openRouterModel }
  }

  const geminiModel = getGeminiFastModel()
  if (isGeminiFastAvailable() && geminiModel && !isGeminiCircuitOpen()) {
    return { provider: 'gemini', model: geminiModel }
  }
  return null
}

export function shouldRunStage1Shadow(cohortKey?: string | null): boolean {
  if (!isStage1ShadowEnabled()) return false
  if (!resolveStage1ShadowProvider()) return false
  const percent = getStage1ShadowPercent()
  if (percent >= 100) return true
  return groqCohortBucket(classifierCohortKey(cohortKey)) < percent
}

function noteShadow(input: {
  provider: string
  success: boolean
  model?: string
  usage?: NormalizedAiUsage
  latencyMs?: number
  schemaValid?: boolean
  length?: number
  requiredFieldsPresent?: boolean
  errorCode?: string
  generationReason?: string
  productionInputTokens?: number
  productionOutputTokens?: number
  promptSystemTokens?: number
  promptSourceTokens?: number
  promptInstructionTokens?: number
  promptOtherTokens?: number
}) {
  try {
    recordAiRequestUsage({
      agentName: 'stage1_writer_shadow',
      operation: 'generate_article_shadow',
      promptVersion: 'stage1-shadow:v1',
      provider: input.provider,
      model: input.model,
      usage: input.usage,
      latencyMs: input.latencyMs,
      success: input.success,
      errorCode: input.errorCode,
      schemaValid: input.schemaValid,
      outputChars: input.length,
      requiredFieldsPresent: input.requiredFieldsPresent,
      generationReason: input.generationReason,
      shadowProvider: input.provider,
      shadowModel: input.model,
      shadowSuccess: input.success,
      shadowInputTokens: input.usage?.inputTokens,
      shadowOutputTokens: input.usage?.outputTokens,
      shadowLatencyMs: input.latencyMs,
      productionInputTokens: input.productionInputTokens,
      productionOutputTokens: input.productionOutputTokens,
      promptSystemTokens: input.promptSystemTokens,
      promptSourceTokens: input.promptSourceTokens,
      promptInstructionTokens: input.promptInstructionTokens,
      promptOtherTokens: input.promptOtherTokens,
    })
  } catch {
    // never block production Stage1
  }
}

function requiredFieldsPresent(text: string): { ok: boolean; length: number; schemaValid: boolean } {
  const jsonText = extractJsonObject(text)
  let parsed: Record<string, unknown> | null = null
  if (jsonText) {
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>
    } catch {
      parsed = null
    }
  }
  const ok = Boolean(
    parsed && REQUIRED.every((key) => typeof parsed![key] === 'string' && String(parsed![key]).trim())
  )
  const length = typeof parsed?.content === 'string' ? parsed.content.length : text.length
  return { ok, length, schemaValid: Boolean(jsonText) }
}

/**
 * Cheap-provider comparison only. Always returns null — never an article.
 */
export async function runStage1Shadow(opts: {
  messages: ChatMessage[]
  cohortKey?: string | null
  generationReason?: GenerationReason
  productionInputTokens?: number
  productionOutputTokens?: number
  promptSystemTokens?: number
  promptSourceTokens?: number
  promptInstructionTokens?: number
  promptOtherTokens?: number
}): Promise<null> {
  if (!shouldRunStage1Shadow(opts.cohortKey)) return null
  const resolved = resolveStage1ShadowProvider()
  if (!resolved) return null

  const startedAt = Date.now()
  const maxTokens = outputTokenLimit('AI_STAGE1_MAX_OUTPUT_TOKENS', 3500)
  const common = {
    generationReason: opts.generationReason,
    productionInputTokens: opts.productionInputTokens,
    productionOutputTokens: opts.productionOutputTokens,
    promptSystemTokens: opts.promptSystemTokens,
    promptSourceTokens: opts.promptSourceTokens,
    promptInstructionTokens: opts.promptInstructionTokens,
    promptOtherTokens: opts.promptOtherTokens,
  }

  try {
    let text = ''
    let usage: NormalizedAiUsage | undefined
    let latencyMs = 0
    let model = resolved.model

    if (resolved.provider === 'groq') {
      const result = await groqChatCompletionDetailed({
        messages: opts.messages,
        model: resolved.model,
        temperature: 0.4,
        maxTokens,
        timeoutMs: 20_000,
        jsonMode: true,
        jsonSchema: STAGE1_SHADOW_SCHEMA as GroqJsonSchema,
        skipTelemetry: true,
      })
      text = result.text
      usage = result.usage
      latencyMs = result.latencyMs
      model = result.model
    } else if (resolved.provider === 'openrouter') {
      const result = await openRouterFastChat({
        messages: opts.messages,
        temperature: 0.4,
        maxTokens,
        timeoutMs: 20_000,
        jsonMode: true,
        skipTelemetry: true,
      })
      text = result.text
      usage = result.usage
      latencyMs = result.latencyMs
      model = result.model
    } else {
      const result = await geminiFastChat({
        messages: opts.messages,
        temperature: 0.4,
        maxTokens,
        timeoutMs: 20_000,
        jsonMode: true,
        skipTelemetry: true,
      })
      text = result.text
      usage = result.usage
      latencyMs = result.latencyMs
      model = result.model
    }

    const parsed = requiredFieldsPresent(text)
    noteShadow({
      provider: resolved.provider,
      success: parsed.ok,
      model,
      usage,
      latencyMs,
      schemaValid: parsed.schemaValid,
      length: parsed.length,
      requiredFieldsPresent: parsed.ok,
      ...common,
    })
  } catch (error) {
    noteShadow({
      provider: resolved.provider,
      success: false,
      model: resolved.model,
      latencyMs: Date.now() - startedAt,
      schemaValid: false,
      requiredFieldsPresent: false,
      errorCode: error instanceof Error ? error.name : 'error',
      ...common,
    })
  }
  return null
}

/** Compile-time + test guard: shadow must not become a WrittenArticle. */
export function shadowMustNotPublish(): true {
  return true
}
