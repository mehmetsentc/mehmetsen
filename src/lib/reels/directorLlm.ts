import 'server-only'

/** Gemini fast adapter for the Reels editor (null when not configured). */
import { geminiFastChat } from '@/lib/ai/providers/geminiChat'
import { getGeminiApiKey } from '@/lib/ai/router/policy'

export function reelsEditorLlm(): ((system: string, user: string) => Promise<string>) | null {
  if ((process.env.REELS_AI_EDITOR ?? 'on').toLowerCase() === 'off') return null
  if (!getGeminiApiKey()) return null
  return async (system, user) => {
    const r = await geminiFastChat({
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.4,
      maxTokens: 400,
      timeoutMs: 12_000,
      jsonMode: true,
      skipTelemetry: true,
    })
    return r.text
  }
}
