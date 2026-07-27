/** Sandbox-only DeepSeek JSON call — never publishes. */
export async function callDeepSeek(params: {
  system: string
  user: string
  model?: string
}): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return { error: 'DEEPSEEK_API_KEY missing' }

  const model = params.model || process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        max_tokens: 4000,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = json.choices?.[0]?.message?.content?.trim() || '{}'
    return JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
