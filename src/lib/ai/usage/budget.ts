/** Soft DeepSeek token warning. Unset → no threshold, pipeline unchanged. Never a hard stop. */
export function getDailyDeepSeekTokenWarning(): number | null {
  const raw = process.env.AI_DAILY_DEEPSEEK_TOKEN_WARNING?.trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}
