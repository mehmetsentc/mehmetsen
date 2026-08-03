/** Sandbox-only DeepSeek JSON call — never publishes. */
import { deepseekChatCompletion, getDeepSeekApiKey, getDeepSeekModel } from '@/lib/ai/deepseekClient'

export async function callDeepSeek(params: {
  system: string
  user: string
  model?: string
}): Promise<Record<string, unknown> | null> {
  if (!getDeepSeekApiKey()) return { error: 'DEEPSEEK_API_KEY missing' }

  try {
    const raw = await deepseekChatCompletion({
      model: getDeepSeekModel(params.model),
      temperature: 0.4,
      maxTokens: 4000,
      timeoutMs: 45_000,
      disableThinking: true,
      jsonMode: true,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
    })
    return JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
