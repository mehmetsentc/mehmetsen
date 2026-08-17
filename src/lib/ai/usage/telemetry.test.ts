import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAiUsageTelemetryEnabled, recordAiRequestUsage } from '@/lib/ai/usage/telemetry'

describe('AI usage telemetry kill switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is enabled by default', () => {
    vi.stubEnv('AI_USAGE_TELEMETRY_ENABLED', '')
    expect(isAiUsageTelemetryEnabled()).toBe(true)
  })

  it('can be turned off without throwing', () => {
    vi.stubEnv('AI_USAGE_TELEMETRY_ENABLED', 'false')
    expect(isAiUsageTelemetryEnabled()).toBe(false)
    expect(() =>
      recordAiRequestUsage({
        success: true,
        agentName: 'stage1_writer',
        operation: 'generate_article',
      })
    ).not.toThrow()
  })

  it('never throws when recording usage', () => {
    expect(() =>
      recordAiRequestUsage({
        success: true,
        agentName: 'stage1_writer',
        operation: 'generate_article',
        generationReason: 'initial',
      })
    ).not.toThrow()
  })
})
