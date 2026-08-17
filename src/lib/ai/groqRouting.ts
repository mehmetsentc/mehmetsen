import { hashAiInput } from '@/lib/ai/usage/hash'
import { getAiUsageContext } from '@/lib/ai/usage/context'

export const GROQ_DEFAULT_FAST_MODEL = 'openai/gpt-oss-20b'
export const GROQ_DEFAULT_STRONG_MODEL = 'openai/gpt-oss-120b'

export function getGroqApiKey(): string | null {
  const key = process.env.GROQ_API_KEY?.trim()
  return key || null
}

export function getGroqFastModel(): string {
  return process.env.GROQ_FAST_MODEL?.trim() || GROQ_DEFAULT_FAST_MODEL
}

export function getGroqStrongModel(): string {
  return process.env.GROQ_STRONG_MODEL?.trim() || GROQ_DEFAULT_STRONG_MODEL
}

export function isGroqClassifiersEnabled(): boolean {
  const raw = process.env.AI_GROQ_CLASSIFIERS_ENABLED?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'on'
}

export function getGroqPercent(): number {
  const n = Number(process.env.AI_GROQ_PERCENT ?? '0')
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.floor(n)))
}

export function classifierCohortKey(explicit?: string | null): string {
  const ctx = getAiUsageContext()
  return (ctx?.newsId || ctx?.queueId || ctx?.traceId || explicit || '').trim()
}

/**
 * Deterministic 0–99 bucket from a stable id. Same key → same cohort.
 */
export function groqCohortBucket(key: string): number {
  const hex = hashAiInput(key || 'missing-cohort')
  if (!hex) return 99
  return parseInt(hex.slice(0, 8), 16) % 100
}

export function isInGroqPercent(key: string, percent = getGroqPercent()): boolean {
  if (percent <= 0) return false
  if (percent >= 100) return true
  return groqCohortBucket(key) < percent
}

/** Eligible classifier calls only. Never forces Groq without key + flag + percent. */
export function shouldUseGroqClassifier(cohortKey?: string | null): boolean {
  if (!isGroqClassifiersEnabled()) return false
  if (!getGroqApiKey()) return false
  return isInGroqPercent(classifierCohortKey(cohortKey))
}
