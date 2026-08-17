import { hashAiInput } from '@/lib/ai/usage/hash'
import { getClassifierCacheTtlMs } from '@/lib/ai/router/flags'

type Entry = { value: string; expiresAt: number }

const store = new Map<string, Entry>()

export function classifierCacheKey(opts: {
  operation: string
  promptVersion: string
  inputHash?: string
}): string | null {
  if (!opts.inputHash) return null
  return `${opts.operation}::${opts.promptVersion}::${opts.inputHash}`
}

export function readClassifierCache(key: string | null): string | null {
  const ttl = getClassifierCacheTtlMs()
  if (!ttl || !key) return null
  const row = store.get(key)
  if (!row) return null
  if (row.expiresAt <= Date.now()) {
    store.delete(key)
    return null
  }
  return row.value
}

export function writeClassifierCache(key: string | null, value: string): void {
  const ttl = getClassifierCacheTtlMs()
  if (!ttl || !key || !value) return
  store.set(key, { value, expiresAt: Date.now() + ttl })
  if (store.size > 500) {
    const now = Date.now()
    for (const [k, v] of store) {
      if (v.expiresAt <= now) store.delete(k)
    }
  }
}

export function hashMessages(messages: Array<{ role: string; content: string }>): string | undefined {
  try {
    return hashAiInput(messages.map((m) => `${m.role}:${m.content}`).join('\n'))
  } catch {
    return undefined
  }
}

/** Test helper */
export function clearClassifierCache(): void {
  store.clear()
}
