import { describe, expect, it } from 'vitest'
import { aggregateAiUsageEvents, resolveAiUsageRange } from '@/lib/ai/usage/aggregate'

describe('aggregateAiUsageEvents', () => {
  it('does not crash on legacy events without token fields', () => {
    const agg = aggregateAiUsageEvents(
      [
        { timestamp: 1_700_000_000_000, task: 'column', provider: 'deepseek', model: 'deepseek-chat' },
        { createdAt: 1_700_000_000_100, success: true, agentName: 'stage1_writer' },
        {
          createdAt: 1_700_000_000_200,
          agentName: 'stage1_writer',
          operation: 'generate_article',
          inputTokens: 1000,
          outputTokens: 200,
          totalTokens: 1200,
          success: true,
          schemaVersion: 1,
        },
      ],
      {
        range: 'today',
        startMs: 1_700_000_000_000,
        endMs: 1_700_086_400_000,
        truncated: false,
      }
    )
    expect(agg.requests).toBe(3)
    expect(agg.inputTokens).toBe(1000)
    expect(agg.outputTokens).toBe(200)
    expect(agg.totalTokens).toBe(1200)
    expect(agg.usageCoverage).toBeCloseTo(1 / 3)
    expect(agg.estimatedCostUsd).toBeNull()
    expect(agg.perPublished.available).toBe(false)
    expect(agg.perPublished.message).toBe('Yeterli attribution verisi yok')
    expect(agg.agents.find((a) => a.agent === 'stage1_writer')?.requests).toBe(2)
  })

  it('treats missing cache tokens as absent, not zero-hit rate from empty fields', () => {
    const agg = aggregateAiUsageEvents(
      [{ createdAt: 1, inputTokens: 10, outputTokens: 2, totalTokens: 12, success: true }],
      { range: 'today', startMs: 0, endMs: 10, truncated: false }
    )
    expect(agg.cacheHitRate).toBeNull()
  })

  it('computes cache hit rate only from present cache fields', () => {
    const agg = aggregateAiUsageEvents(
      [{ createdAt: 1, cacheHitTokens: 80, cacheMissTokens: 20, success: true }],
      { range: 'today', startMs: 0, endMs: 10, truncated: false }
    )
    expect(agg.cacheHitRate).toBeCloseTo(0.8)
  })
})

describe('resolveAiUsageRange', () => {
  it('uses Europe/Istanbul day bounds for today', () => {
    const noonUtc = Date.parse('2026-08-17T12:00:00.000Z')
    const range = resolveAiUsageRange('today', noonUtc)
    expect(range.timezone).toBe('Europe/Istanbul')
    expect(range.startMs).toBe(Date.parse('2026-08-17T00:00:00+03:00'))
    expect(range.endMs).toBe(Date.parse('2026-08-18T00:00:00+03:00'))
  })
})
