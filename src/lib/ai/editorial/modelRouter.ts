import type { AiEditorDocument, AiEditorTask, AiModelAssignment, AiProviderId } from '@/types/aiEditor'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

const DEFAULT_DEEPSEEK_MODEL =
  process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'

export interface ResolvedModel {
  provider: AiProviderId
  model: string
  fallback?: { provider: AiProviderId; model: string }
}

function defaultForTask(task: AiEditorTask): AiModelAssignment {
  // All tasks default to cheap DeepSeek; Gemini only via explicit editor assignment + flags.
  void task
  return {
    provider: 'deepseek',
    model: DEFAULT_DEEPSEEK_MODEL,
  }
}

/** Resolve provider/model for an editor task. Editor identity ≠ model. */
export function resolveModelForEditor(
  editor: AiEditorDocument | null | undefined,
  task: AiEditorTask
): ResolvedModel {
  const assignment = editor?.modelAssignments?.[task] ?? defaultForTask(task)
  const resolved: ResolvedModel = {
    provider: assignment.provider,
    model: assignment.model || DEFAULT_DEEPSEEK_MODEL,
  }
  if (assignment.fallbackProvider && assignment.fallbackModel) {
    resolved.fallback = {
      provider: assignment.fallbackProvider,
      model: assignment.fallbackModel,
    }
  }
  // Prefer DeepSeek when Gemini key missing for research
  if (resolved.provider === 'gemini' && !process.env.GEMINI_API_KEY?.trim()) {
    if (resolved.fallback) return { provider: resolved.fallback.provider, model: resolved.fallback.model }
    return { provider: 'deepseek', model: DEFAULT_DEEPSEEK_MODEL }
  }
  if (resolved.provider === 'deepseek' && !process.env.DEEPSEEK_API_KEY?.trim() && resolved.fallback) {
    return { provider: resolved.fallback.provider, model: resolved.fallback.model }
  }
  return resolved
}

export async function recordAiUsage(event: {
  editorId: string | null
  task: string
  provider: AiProviderId
  model: string
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
  published?: boolean
}): Promise<void> {
  try {
    await getAdminFirestore()
      .collection(Collections.AI_USAGE_EVENTS)
      .add({
        ...event,
        published: event.published ?? false,
        timestamp: Date.now(),
      })
  } catch {
    // non-critical
  }
}
