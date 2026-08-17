import { groqCohortBucket, classifierCohortKey, getGroqApiKey } from '@/lib/ai/groqRouting'
import { groqChatCompletionDetailed, type GroqJsonSchema } from '@/lib/ai/groqClient'
import { extractJsonObject } from '@/lib/ai/router/validation'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'
import { inputCharLimit, outputTokenLimit } from '@/lib/ai/usage/tokenBudget'

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

export function shouldRunStage1Shadow(cohortKey?: string | null): boolean {
  if (!isStage1ShadowEnabled()) return false
  if (!getGroqApiKey()) return false
  const percent = envPercent('AI_STAGE1_SHADOW_PERCENT')
  if (percent >= 100) return true
  return groqCohortBucket(classifierCohortKey(cohortKey)) < percent
}

function noteShadow(input: {
  success: boolean
  model?: string
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  latencyMs?: number
  schemaValid?: boolean
  length?: number
  requiredFieldsPresent?: boolean
  errorCode?: string
}) {
  try {
    recordAiRequestUsage({
      agentName: 'stage1_writer_shadow',
      operation: 'generate_article_shadow',
      promptVersion: 'stage1-shadow:v1',
      provider: 'groq',
      model: input.model,
      usage: input.usage,
      latencyMs: input.latencyMs,
      success: input.success,
      errorCode: input.errorCode,
      schemaValid: input.schemaValid,
      outputChars: input.length,
      requiredFieldsPresent: input.requiredFieldsPresent,
    })
  } catch {
    // never block
  }
}

/**
 * Cheap-provider comparison only. Never returned to the news pipeline.
 */
export async function runStage1Shadow(opts: {
  messages: Array<{ role: string; content: string }>
  cohortKey?: string | null
}): Promise<null> {
  if (!shouldRunStage1Shadow(opts.cohortKey)) return null
  const startedAt = Date.now()
  try {
    const result = await groqChatCompletionDetailed({
      messages: opts.messages,
      temperature: 0.4,
      maxTokens: outputTokenLimit('AI_STAGE1_MAX_OUTPUT_TOKENS', 3500),
      timeoutMs: 20_000,
      jsonMode: true,
      jsonSchema: STAGE1_SHADOW_SCHEMA as GroqJsonSchema,
      skipTelemetry: true,
      telemetry: {
        agentName: 'stage1_writer_shadow',
        operation: 'generate_article_shadow',
        promptVersion: 'stage1-shadow:v1',
      },
    })
    const jsonText = extractJsonObject(result.text)
    let parsed: Record<string, unknown> | null = null
    if (jsonText) {
      try {
        parsed = JSON.parse(jsonText) as Record<string, unknown>
      } catch {
        parsed = null
      }
    }
    const requiredFieldsPresent = Boolean(
      parsed && REQUIRED.every((key) => typeof parsed[key] === 'string' && String(parsed[key]).trim())
    )
    const length =
      typeof parsed?.content === 'string' ? parsed.content.length : result.text.length
    noteShadow({
      success: requiredFieldsPresent,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
      schemaValid: Boolean(jsonText),
      length,
      requiredFieldsPresent,
    })
  } catch (error) {
    noteShadow({
      success: false,
      latencyMs: Date.now() - startedAt,
      schemaValid: false,
      requiredFieldsPresent: false,
      errorCode: error instanceof Error ? error.name : 'error',
    })
  }
  return null
}

/** Test helper — production article is never this value. */
export function shadowMustNotPublish(): true {
  return true
}

export function clipShadowSource(text: string): string {
  return text.slice(0, inputCharLimit('AI_STAGE1_MAX_INPUT_CHARS', 6000))
}
