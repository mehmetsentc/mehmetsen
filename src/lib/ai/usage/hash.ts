import { createHash } from 'node:crypto'

/** SHA-256 hex of normalized input. Never store the raw string. */
export function hashAiInput(value: string | undefined | null): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  return createHash('sha256').update(text).digest('hex')
}
