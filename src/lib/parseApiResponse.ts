/**
 * Safe fetch body parser for admin clients.
 * Avoids `res.json()` throwing SyntaxError on Vercel/platform plain-text errors
 * like "An error occurred with this application."
 *
 * Generic is unconstrained so typed API payloads (interfaces without index
 * signatures) typecheck — `Record<string, unknown>` rejected QueueEditorData etc.
 */
export async function parseApiResponse<T = Record<string, unknown>>(
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
    if (/an error occurred/i.test(snippet)) {
      throw new Error(
        res.status === 504 || /timeout/i.test(snippet)
          ? `Sunucu zaman aşımı (HTTP ${res.status || 504}). Daha az haber seçip yeniden deneyin.`
          : `Sunucu hatası (HTTP ${res.status || 500}). Yanıt JSON değil — işlem yarıda kesilmiş olabilir.`
      )
    }
    throw new Error(
      res.ok
        ? `Geçersiz API yanıtı: ${snippet}`
        : `HTTP ${res.status}: ${snippet}`
    )
  }
}
