import { crawlerAiDispatchConfig } from './flags'
import type { CrawlerAiCircuitState } from './types'

export function emptyCircuit(provider = 'deepseek'): CrawlerAiCircuitState {
  return {
    provider,
    state: 'CLOSED',
    openedAt: null,
    reason: null,
    consecutive429: 0,
    consecutive5xx: 0,
    lastStatus: null,
  }
}

export function shouldRetryProviderStatus(status: number): boolean {
  if (status === 402 || status === 401) return false
  if (status === 429) return true
  if (status >= 500 && status <= 599) return true
  return false
}

export function applyProviderStatus(
  current: CrawlerAiCircuitState,
  status: number,
  now = new Date()
): CrawlerAiCircuitState {
  const cfg = crawlerAiDispatchConfig()
  if (status === 402) {
    return {
      ...current,
      state: 'OPEN',
      openedAt: now,
      reason: 'insufficient_balance',
      lastStatus: 402,
      consecutive429: 0,
      consecutive5xx: 0,
    }
  }
  if (status === 401) {
    return {
      ...current,
      state: 'OPEN',
      openedAt: now,
      reason: 'authentication_failure',
      lastStatus: 401,
      consecutive429: 0,
      consecutive5xx: 0,
    }
  }
  if (status === 429) {
    const consecutive429 = current.consecutive429 + 1
    const open = consecutive429 >= cfg.circuit429Threshold
    return {
      ...current,
      consecutive429,
      lastStatus: 429,
      state: open ? 'OPEN' : current.state,
      openedAt: open ? now : current.openedAt,
      reason: open ? 'repeated_429' : current.reason,
    }
  }
  if (status >= 500 && status <= 599) {
    const consecutive5xx = current.consecutive5xx + 1
    const open = consecutive5xx >= cfg.circuit5xxThreshold
    return {
      ...current,
      consecutive5xx,
      lastStatus: status,
      state: open ? 'OPEN' : current.state,
      openedAt: open ? now : current.openedAt,
      reason: open ? 'repeated_5xx' : current.reason,
    }
  }
  if (status >= 200 && status < 300) {
    return {
      ...current,
      consecutive429: 0,
      consecutive5xx: 0,
      lastStatus: status,
    }
  }
  return { ...current, lastStatus: status }
}

export function retryBackoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** Math.max(0, attempt - 1))
}
