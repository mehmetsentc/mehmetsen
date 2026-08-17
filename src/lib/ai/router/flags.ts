import { groqCohortBucket, classifierCohortKey } from '@/lib/ai/groqRouting'
import type { AiTaskType } from '@/lib/ai/router/types'

function envFlag(name: string, defaultOn = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return defaultOn
  return raw === '1' || raw === 'true' || raw === 'on'
}

function envPercent(name: string, fallback = 0): number {
  const n = Number(process.env[name] ?? String(fallback))
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.floor(n)))
}

export function isMultiProviderEnabled(): boolean {
  return envFlag('AI_MULTI_PROVIDER_ENABLED', false)
}

export function getMultiProviderPercent(): number {
  return envPercent('AI_MULTI_PROVIDER_PERCENT', 0)
}

export function isTaskTypeEnabled(task: AiTaskType): boolean {
  if (task === 'classification') return envFlag('AI_MULTI_PROVIDER_CLASSIFICATION_ENABLED', true)
  if (task === 'extraction') return envFlag('AI_MULTI_PROVIDER_EXTRACTION_ENABLED', false)
  if (task === 'social') return envFlag('AI_MULTI_PROVIDER_SOCIAL_ENABLED', false)
  if (task === 'longform') {
    return (
      envFlag('AI_MULTI_PROVIDER_LONGFORM_ENABLED', false) &&
      envFlag('AI_STAGE1_CHEAP_PROVIDER_ENABLED', false)
    )
  }
  return false
}

export function getStage1CheapPercent(): number {
  return envPercent('AI_STAGE1_CHEAP_PROVIDER_PERCENT', 0)
}

export function isInMultiProviderPercent(cohortKey?: string | null): boolean {
  const percent = getMultiProviderPercent()
  if (percent <= 0) return false
  if (percent >= 100) return true
  return groqCohortBucket(classifierCohortKey(cohortKey)) < percent
}

/** Extra cheap providers (Gemini/OpenRouter) after Phase 2A Groq. */
export function shouldUseMultiProviderChain(
  task: AiTaskType,
  cohortKey?: string | null
): boolean {
  if (!isMultiProviderEnabled()) return false
  if (!isTaskTypeEnabled(task)) return false
  if (task === 'longform' && getStage1CheapPercent() <= 0) return false
  if (task === 'longform') {
    const p = getStage1CheapPercent()
    if (p < 100 && groqCohortBucket(classifierCohortKey(cohortKey)) >= p) return false
  }
  return isInMultiProviderPercent(cohortKey)
}

export function getClassifierCacheTtlMs(): number {
  const n = Number(process.env.AI_CLASSIFIER_CACHE_TTL_MS ?? '0')
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(60 * 60 * 1000, Math.floor(n))
}

export function isSkipRedundantClassifierEnabled(): boolean {
  return envFlag('AI_SKIP_REDUNDANT_CLASSIFIER', false)
}
