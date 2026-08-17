import { getGroqApiKey, shouldUseGroqClassifier } from '@/lib/ai/groqRouting'
import { shouldUseMultiProviderChain } from '@/lib/ai/router/flags'
import { isGeminiCircuitOpen } from '@/lib/ai/providers/geminiCircuit'
import type { AiTaskType, RouterProviderId } from '@/lib/ai/router/types'

export function getGeminiFastModel(): string | null {
  const model = process.env.GEMINI_FAST_MODEL?.trim()
  return model || null
}

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null
}

export function getOpenRouterApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null
}

export function getOpenRouterFastModel(): string | null {
  const model = process.env.OPENROUTER_FAST_MODEL?.trim()
  return model || null
}

export function isGeminiFastAvailable(): boolean {
  return Boolean(getGeminiApiKey() && getGeminiFastModel())
}

export function getOpenRouterReadiness(): {
  apiKeyDefined: boolean
  fastModelDefined: boolean
  available: boolean
} {
  const apiKeyDefined = Boolean(getOpenRouterApiKey())
  const fastModelDefined = Boolean(getOpenRouterFastModel())
  return { apiKeyDefined, fastModelDefined, available: apiKeyDefined && fastModelDefined }
}

export function isOpenRouterAvailable(): boolean {
  return getOpenRouterReadiness().available
}

function unique(ids: RouterProviderId[]): RouterProviderId[] {
  const seen = new Set<RouterProviderId>()
  const out: RouterProviderId[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Task-based cheap-first chain. DeepSeek is always last when a key exists.
 * Phase 2A Groq canary is independent of the multi-provider flag.
 */
export function resolveProviderChain(
  task: AiTaskType,
  cohortKey?: string | null
): RouterProviderId[] {
  const chain: RouterProviderId[] = []
  const multi = shouldUseMultiProviderChain(task, cohortKey)

  if (task === 'classification') {
    if (shouldUseGroqClassifier(cohortKey)) chain.push('groq')
    if (multi) {
      if (isGeminiFastAvailable() && !isGeminiCircuitOpen()) chain.push('gemini')
      if (isOpenRouterAvailable()) chain.push('openrouter')
    }
  } else if (task === 'extraction') {
    if (multi) {
      if (isGeminiFastAvailable() && !isGeminiCircuitOpen()) chain.push('gemini')
      if (getGroqApiKey()) chain.push('groq')
      if (isOpenRouterAvailable()) chain.push('openrouter')
    }
  } else if (task === 'social') {
    if (multi) {
      if (isGeminiFastAvailable() && !isGeminiCircuitOpen()) chain.push('gemini')
      if (getGroqApiKey()) chain.push('groq')
      if (isOpenRouterAvailable()) chain.push('openrouter')
    }
  } else {
    // longform / quality_critical: DeepSeek only unless a future Stage1 flag is on
    if (multi && task === 'longform') {
      if (getGroqApiKey()) chain.push('groq')
      if (isGeminiFastAvailable() && !isGeminiCircuitOpen()) chain.push('gemini')
      if (isOpenRouterAvailable()) chain.push('openrouter')
    }
  }

  if (process.env.DEEPSEEK_API_KEY?.trim()) chain.push('deepseek')
  return unique(chain)
}

export function timeoutForTask(task: AiTaskType): number {
  if (task === 'classification') return 10_000
  if (task === 'extraction') return 15_000
  if (task === 'social') return 20_000
  if (task === 'longform') return 50_000
  return 90_000
}

export function maxTokensForTask(task: AiTaskType): number {
  if (task === 'classification') return 200
  if (task === 'extraction') return 400
  if (task === 'social') return 1024
  if (task === 'longform') return 3500
  return 1800
}

export function temperatureForTask(task: AiTaskType): number {
  if (task === 'classification') return 0.1
  if (task === 'extraction') return 0.2
  if (task === 'social') return 0.4
  if (task === 'longform') return 0.4
  return 0.12
}
