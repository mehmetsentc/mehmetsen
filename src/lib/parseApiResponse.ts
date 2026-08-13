/**
 * Safe fetch body parser for admin clients.
 * Avoids `res.json()` throwing SyntaxError on Vercel/platform plain-text errors
 * like "An error occurred with this application."
 */
export async function parseApiResponse<T extends Record<string, unknown> = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text()
  const trimmed = text.trim()
  if (!trimmed) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return {} as T
  }
  try {
    return JSON.parse(trimmed) as T
  } catch {
    const snippet = trimmed.replace(/\s+/g, ' ').slice(0, 180)
    throw new Error(
      res.ok
        ? `Geçersiz API yanıtı: ${snippet}`
        : `HTTP ${res.status}: ${snippet}`
    )
  }
}
