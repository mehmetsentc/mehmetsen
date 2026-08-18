import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAiUsageEventForTest, isAiUsageTelemetryEnabled, recordAiRequestUsage } from '@/lib/ai/usage/telemetry'

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
        promptVariant: 'compact',
      })
    ).not.toThrow()
  })

  it('persists closed retryTriggers and drops article text', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage1_writer',
      operation: 'generate_article',
      generationReason: 'continuation',
      retryTriggers: ['body_too_short', 'İçerik: Belediye açıkladı', 'draft'],
    })
    expect(doc.retryTriggers).toEqual(['body_too_short', 'draft'])
    expect(JSON.stringify(doc)).not.toMatch(/Belediye açıkladı/)
  })

  it('persists gate metrics without article text', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage4_gate',
      operation: 'gate_keep',
      provider: 'heuristic',
      promptVariant: 'optimized',
      gateDecision: 'draft',
      publishScore: 40,
      categoryConfidence: 72,
      outputWordCount: 140,
      retryTriggers: ['short_body_quality', 'İçerik: Belediye'],
    })
    expect(doc.gateDecision).toBe('draft')
    expect(doc.outputWordCount).toBe(140)
    expect(doc.retryTriggers).toEqual(['short_body_quality'])
    expect(JSON.stringify(doc)).not.toMatch(/Belediye/)
  })

  it('persists shadow comparison fields without prompt text', () => {
    const doc = buildAiUsageEventForTest({
      success: true,
      agentName: 'stage1_writer_shadow',
      operation: 'generate_article_shadow',
      shadowProvider: 'groq',
      shadowModel: 'openai/gpt-oss-20b',
      shadowSuccess: true,
      shadowInputTokens: 12,
      shadowOutputTokens: 8,
      shadowLatencyMs: 40,
      productionInputTokens: 90,
      productionOutputTokens: 30,
      generationReason: 'initial',
      promptSystemTokens: 20,
      promptSourceTokens: 50,
      promptInstructionTokens: 10,
      promptOtherTokens: 5,
    })
    const serialized = JSON.stringify(doc)
    expect(doc.shadowProvider).toBe('groq')
    expect(doc.shadowSuccess).toBe(true)
    expect(doc.productionInputTokens).toBe(90)
    expect(serialized).not.toMatch(/Sen NaHaber/)
    expect(serialized).not.toMatch(/İçerik:/)
  })
})
