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
      // REELS-13: a 40–60 s anchor script (≈ 800 characters) needs room.
      maxTokens: 1500,
      timeoutMs: 25_000,
      jsonMode: true,
      skipTelemetry: true,
    })
    return r.text
  }
}
