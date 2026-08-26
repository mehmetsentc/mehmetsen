import type { FeedCursorPayload } from '@/types/smartFeed'

export function encodeFeedCursor(payload: FeedCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeFeedCursor(raw: string | null | undefined): FeedCursorPayload | null {
  if (!raw?.trim()) return null
  try {
    const json = Buffer.from(raw.trim(), 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as FeedCursorPayload
    if (!parsed?.id || !parsed?.publishedAt) return null
    return parsed
  } catch {
    return null
  }
}

export function compareFeedRows(
  a: { publishedAt: Date; sortScore: number; articleId: string },
  b: { publishedAt: Date; sortScore: number; articleId: string }
): number {
  const ta = a.publishedAt.getTime()
  const tb = b.publishedAt.getTime()
  if (tb !== ta) return tb - ta
  if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore
  return a.articleId.localeCompare(b.articleId)
}

/** Stable daily seed for deterministic discovery ordering. */
export function deterministicScore(articleId: string, dayKey: string): number {
  let h = 2166136261
  const s = `${dayKey}:${articleId}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}
