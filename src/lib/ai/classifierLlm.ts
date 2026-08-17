/**
 * Classifier LLM router: Phase 2A Groq canary + optional multi-provider chain.
 * Prompts stay at the call site. Cheap success never calls DeepSeek.
 */

import { runAI } from '@/lib/ai/router/aiRouter'

export type ClassifierLlmMeta = {
  agentName: string
  operation: string
  promptVersion: string
  system: string
  user: string
  cohortKey?: string
}

export type ClassifierProvider = 'groq' | 'gemini' | 'openrouter' | 'deepseek'

/**
 * Groq (Phase 2A) then optional Gemini/OpenRouter then DeepSeek.
 * Schema/JSON failure falls through the chain. Never throws to the news pipeline.
 */
export async function completeClassifierJson<T>(
  meta: ClassifierLlmMeta,
  validate: (raw: string) => T | null
): Promise<T | null> {
  try {
    const result = await runAI({
      agent: meta.agentName,
      operation: meta.operation,
      promptVersion: meta.promptVersion,
      taskType: 'classification',
      messages: [
        { role: 'system', content: meta.system },
        { role: 'user', content: meta.user },
      ],
      jsonMode: true,
      validate,
      cohortKey: meta.cohortKey,
    })
    return (result.value as T | null) ?? null
  } catch {
    return null
  }
}

/** Test helper — orchestration only, no network. */
export async function routeClassifierWithProviders<T>(opts: {
  useGroq: boolean
  groq: () => Promise<string | null>
  deepseek: () => Promise<string | null>
  validate: (raw: string) => T | null
  gemini?: () => Promise<string | null>
  openrouter?: () => Promise<string | null>
}): Promise<{ value: T | null; used: ClassifierProvider | null; fallback: boolean }> {
  const steps: Array<{ id: ClassifierProvider; call: () => Promise<string | null> }> = []
  if (opts.useGroq) steps.push({ id: 'groq', call: opts.groq })
  if (opts.gemini) steps.push({ id: 'gemini', call: opts.gemini })
  if (opts.openrouter) steps.push({ id: 'openrouter', call: opts.openrouter })
  steps.push({ id: 'deepseek', call: opts.deepseek })

  let fallback = false
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    let raw: string | null = null
    try {
      raw = await step.call()
    } catch {
      raw = null
    }
    if (raw) {
      const parsed = opts.validate(raw)
      if (parsed) return { value: parsed, used: step.id, fallback }
    }
    if (i < steps.length - 1) fallback = true
  }
  return { value: null, used: null, fallback }
}
