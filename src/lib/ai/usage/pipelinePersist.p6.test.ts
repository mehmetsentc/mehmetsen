import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import { buildAiUsageEventForTest } from '@/lib/ai/usage/telemetry'
import { PIPELINE_PERSIST_AGENT, recordPipelinePersistUsage } from '@/lib/ai/usage/pipelinePersist'

describe('P6 pipeline_persist usage event', () => {
  it('writes newsId, editorId, traceId, published and optional gate fields', () => {
    const doc = runWithAiUsageContext({ traceId: 'trace-p6-shared' }, () =>
      buildAiUsageEventForTest({
        success: true,
        agentName: PIPELINE_PERSIST_AGENT,
        operation: 'draft_created',
        provider: 'heuristic',
        newsId: 'news_abc',
        editorId: 'ai_editor_yerel-eskisehir',
        published: false,
        gateDecision: 'draft',
        publishScore: 42,
      })
    )
    expect(doc).toMatchObject({
      agentName: 'pipeline_persist',
      operation: 'draft_created',
      newsId: 'news_abc',
      editorId: 'ai_editor_yerel-eskisehir',
      traceId: 'trace-p6-shared',
      published: false,
      gateDecision: 'draft',
      publishScore: 42,
    })
  })

  it('shares traceId with stage4_gate so the two events can be joined', () => {
    const pair = runWithAiUsageContext({ traceId: 'trace-p6-join' }, () => {
      const gate = buildAiUsageEventForTest({
        success: true,
        agentName: 'stage4_gate',
        operation: 'gate_keep',
        provider: 'heuristic',
        editorId: 'ai_editor_yerel-eskisehir',
        gateDecision: 'publish',
        publishScore: 88,
      })
      const persist = buildAiUsageEventForTest({
        success: true,
        agentName: PIPELINE_PERSIST_AGENT,
        operation: 'publish_confirmed',
        provider: 'heuristic',
        newsId: 'news_published_1',
        editorId: 'ai_editor_yerel-eskisehir',
        published: true,
        gateDecision: 'publish',
        publishScore: 88,
      })
      return { gate, persist }
    })
    expect(pair.gate.agentName).toBe('stage4_gate')
    expect(pair.persist.agentName).toBe('pipeline_persist')
    expect(pair.gate.traceId).toBe('trace-p6-join')
    expect(pair.persist.traceId).toBe(pair.gate.traceId)
    expect(pair.persist.newsId).toBe('news_published_1')
    expect(pair.persist.editorId).toBe(pair.gate.editorId)
    expect(pair.gate.newsId).toBeUndefined()
  })

  it('recordPipelinePersistUsage never throws', () => {
    expect(() =>
      runWithAiUsageContext({ traceId: 'trace-p6-safe' }, () =>
        recordPipelinePersistUsage({
          newsId: 'n1',
          editorId: 'ed1',
          operation: 'updated',
          published: true,
        })
      )
    ).not.toThrow()
  })

  it('pipeline persist return sites emit pipeline_persist (additive telemetry only)', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/newsroom/pipeline.ts'), 'utf8')
    expect(src).toMatch(/operation: 'publish_confirmed'/)
    expect(src).toMatch(/operation: 'draft_created'/)
    expect(src).toMatch(/operation: 'updated'/)
    expect(src.match(/recordPipelinePersistUsage\(/g)?.length).toBeGreaterThanOrEqual(5)
  })
})
