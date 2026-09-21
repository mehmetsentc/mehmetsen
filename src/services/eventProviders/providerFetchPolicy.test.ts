import { describe, expect, it } from 'vitest'
import {
  clampPages,
  isAbortError,
  MAX_PAGES_GUARD,
  retryAfterMs,
  shouldRetryHttp,
  shouldRetryThrown,
  withBoundedRetries,
} from './providerFetchPolicy'

describe('providerFetchPolicy', () => {
  it('retries 429 and 5xx within bounds only', () => {
    expect(shouldRetryHttp(429, 0)).toBe(true)
    expect(shouldRetryHttp(429, 1)).toBe(true)
    expect(shouldRetryHttp(429, 2)).toBe(false)
    expect(shouldRetryHttp(503, 0)).toBe(true)
    expect(shouldRetryHttp(503, 1)).toBe(false)
    expect(shouldRetryHttp(401, 0)).toBe(false)
    expect(shouldRetryHttp(403, 0)).toBe(false)
    expect(shouldRetryHttp(200, 0)).toBe(false)
  })

  it('retries abort/network once and honors Retry-After cap', () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(isAbortError(abort)).toBe(true)
    expect(shouldRetryThrown(abort, 0)).toBe(true)
    expect(shouldRetryThrown(abort, 1)).toBe(false)
    expect(retryAfterMs('30')).toBe(5000)
    expect(retryAfterMs('1')).toBe(1000)
  })

  it('clamps pagination and bounds retry wrapper', async () => {
    expect(clampPages(99)).toBe(MAX_PAGES_GUARD)
    expect(clampPages(0)).toBe(1)
    let calls = 0
    const value = await withBoundedRetries(async () => {
      calls += 1
      return { status: 503 }
    }, (result) => (shouldRetryHttp(result.status, calls - 1) ? { retry: true, waitMs: 1 } : null))
    expect(value.status).toBe(503)
    expect(calls).toBe(2)
  })
})
