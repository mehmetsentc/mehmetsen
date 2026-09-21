/**
 * Conservative fetch retry / abort policy for occurrence cron.
 * No proxy rotation, no challenge bypass.
 */

export const PROVIDER_TIMEOUT_MS = 12_000
export const MAX_TRANSIENT_RETRIES = 1
export const MAX_RATE_LIMIT_RETRIES = 2
export const MAX_RETRY_AFTER_MS = 5_000
export const MAX_PAGES_GUARD = 20

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted|timeout/i.test(error.message))
}

export function isRetryableHttpStatus(status: number): 'rate_limit' | 'transient' | 'never' {
  if (status === 429) return 'rate_limit'
  if (status >= 500 && status <= 599) return 'transient'
  if (status === 401 || status === 403) return 'never'
  return 'never'
}

export function shouldRetryHttp(status: number, attempt: number): boolean {
  const kind = isRetryableHttpStatus(status)
  if (kind === 'never') return false
  if (kind === 'rate_limit') return attempt < MAX_RATE_LIMIT_RETRIES
  return attempt < MAX_TRANSIENT_RETRIES
}

export function shouldRetryThrown(error: unknown, attempt: number): boolean {
  if (attempt >= MAX_TRANSIENT_RETRIES) return false
  return isAbortError(error) || (error instanceof TypeError && /fetch|network/i.test(error.message))
}

export function retryAfterMs(header: string | null | undefined): number {
  if (!header?.trim()) return 400
  const seconds = Number(header.trim())
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
  }
  const date = Date.parse(header)
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_AFTER_MS)
  }
  return 400
}

export function clampPages(requested: number | undefined, fallback = 8): number {
  const value = requested ?? fallback
  return Math.max(1, Math.min(value, MAX_PAGES_GUARD))
}

export async function withBoundedRetries<T>(
  run: (attempt: number) => Promise<T>,
  classify: (result: T) => { retry: boolean; waitMs?: number } | null
): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      const result = await run(attempt)
      const decision = classify(result)
      if (!decision?.retry) return result
      await sleep(decision.waitMs ?? 400)
      attempt += 1
    } catch (error) {
      if (!shouldRetryThrown(error, attempt)) throw error
      await sleep(400)
      attempt += 1
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
