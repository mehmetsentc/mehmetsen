import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/auth', () => ({ auth: { currentUser: null } }))
import { REEL_JOB_POLL_MS, REEL_JOB_SLOW_POLL_MS, reelJobPollDelay } from './reelsApi'

describe('FinOps 13 Nov: reel job status polling backs off', () => {
  it('polls every 4 s for the first 40 s', () => {
    expect(reelJobPollDelay(0)).toBe(REEL_JOB_POLL_MS)
    expect(reelJobPollDelay(39_999)).toBe(4000)
  })
  it('then every 10 s', () => {
    expect(reelJobPollDelay(40_000)).toBe(REEL_JOB_SLOW_POLL_MS)
    expect(reelJobPollDelay(5 * 60_000)).toBe(10_000)
  })
})
