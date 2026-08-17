import { AsyncLocalStorage } from 'node:async_hooks'
import type { AiUsageContext } from '@/lib/ai/usage/types'

const storage = new AsyncLocalStorage<AiUsageContext>()

export function getAiUsageContext(): AiUsageContext | undefined {
  return storage.getStore()
}

export function runWithAiUsageContext<T>(ctx: AiUsageContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

/** Nested override (agent/operation) while keeping trace/queue ids. */
export function withAiUsageContext<T>(partial: AiUsageContext, fn: () => T): T {
  const parent = storage.getStore() ?? {}
  return storage.run({ ...parent, ...partial }, fn)
}
