import { describe, expect, it } from 'vitest'
import { getAiUsageContext, runWithAiUsageContext, withAiUsageContext } from './context'

describe('P17.12D AI usage context inheritance', () => {
  it('withAiUsageContext preserves parent ingestionLane when adding traceId', () => {
    runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () => {
      withAiUsageContext({ traceId: 'trace-123' }, () => {
        const ctx = getAiUsageContext()
        expect(ctx?.ingestionLane).toBe('manual_editor')
        expect(ctx?.traceId).toBe('trace-123')
      })
    })
  })

  it('runWithAiUsageContext replaces store and drops parent lane (regression guard)', () => {
    runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () => {
      runWithAiUsageContext({ traceId: 'trace-only' }, () => {
        expect(getAiUsageContext()?.ingestionLane).toBeUndefined()
      })
    })
  })
})
