/**
 * P6 Track C — second usage event after a news/draft row is actually persisted.
 * Does not change gate or publish decisions. Join key to stage4_gate is traceId.
 */
import { getAiUsageContext } from '@/lib/ai/usage/context'
import { recordAiRequestUsage } from '@/lib/ai/usage/telemetry'

export const PIPELINE_PERSIST_AGENT = 'pipeline_persist' as const

export type PipelinePersistOperation = 'publish_confirmed' | 'draft_created' | 'updated'

export function recordPipelinePersistUsage(input: {
  newsId: string
  editorId?: string | null
  operation: PipelinePersistOperation
  published: boolean
  gateDecision?: string
  publishScore?: number
}): void {
  const ctx = getAiUsageContext()
  recordAiRequestUsage({
    success: true,
    agentName: PIPELINE_PERSIST_AGENT,
    operation: input.operation,
    provider: 'heuristic',
    newsId: input.newsId,
    editorId: input.editorId,
    traceId: ctx?.traceId,
    published: input.published,
    gateDecision: input.gateDecision,
    publishScore: input.publishScore,
  })
}
