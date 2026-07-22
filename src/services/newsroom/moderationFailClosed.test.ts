import { describe, expect, it } from 'vitest'

/**
 * Mirrors pipeline moderation fail-closed selection (NEWSROOM_MODERATION_FAIL_CLOSED !== '0').
 * Error reasons must never be coerced to approve when fail-closed is on.
 */
function selectModeration(
  moderationRaw: { decision: 'approve' | 'review' | 'reject'; reasons: string[] },
  failClosed: boolean
) {
  if (failClosed) return moderationRaw
  if (moderationRaw.reasons.some((r) => r.startsWith('error:'))) {
    return { ...moderationRaw, decision: 'approve' as const }
  }
  return moderationRaw
}

describe('moderation fail-closed', () => {
  it('keeps review on API error when fail-closed is enabled', () => {
    const raw = { decision: 'review' as const, reasons: ['error:timeout'] }
    expect(selectModeration(raw, true).decision).toBe('review')
  })

  it('does not auto-approve errors when fail-closed is the default path', () => {
    const raw = { decision: 'review' as const, reasons: ['error:provider_down'] }
    const envFailClosed = process.env.NEWSROOM_MODERATION_FAIL_CLOSED !== '0'
    expect(selectModeration(raw, envFailClosed).decision).toBe('review')
  })
})
