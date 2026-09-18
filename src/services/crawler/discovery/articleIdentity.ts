import { titleHashOf } from '../duplicate/hash'
import type { CrawlerStore } from '../store/types'

export const IDENTITY_CONTENT_KEY = 'contentHash'
export const IDENTITY_TITLE_KEY = 'titleHash'
/** RSS titles shorter than this are too generic for source-level title memory. */
export const TITLE_HINT_MEMORY_MIN = 16

export type SourceArticleIdentity = {
  contentHash?: string | null
  titleHash?: string | null
}

function asHash(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 8 ? value : null
}

export function identityFromMetadata(meta: Record<string, unknown> | null | undefined): {
  contentHash: string | null
  titleHash: string | null
} {
  return {
    contentHash: asHash(meta?.[IDENTITY_CONTENT_KEY]),
    titleHash: asHash(meta?.[IDENTITY_TITLE_KEY]),
  }
}

export function mergeIdentityMetadata(
  existing: Record<string, unknown> | null | undefined,
  identity: SourceArticleIdentity
): Record<string, unknown> {
  const next = { ...(existing || {}) }
  if (identity.contentHash) next[IDENTITY_CONTENT_KEY] = identity.contentHash
  if (identity.titleHash) next[IDENTITY_TITLE_KEY] = identity.titleHash
  return next
}

export function titleHintQualifiesForMemory(titleHint: string | null | undefined): boolean {
  const normalized = (titleHint || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
  return normalized.length >= TITLE_HINT_MEMORY_MIN
}

export function titleHashForHint(titleHint: string): string {
  return titleHashOf(titleHint)
}

export async function persistDiscoveryArticleIdentity(
  store: CrawlerStore,
  discoveredUrlId: string | null | undefined,
  identity: SourceArticleIdentity
): Promise<void> {
  if (!discoveredUrlId) return
  if (!identity.contentHash && !identity.titleHash) return
  const current = await store.getDiscoveredById(discoveredUrlId)
  if (!current) return
  await store.updateDiscoveredUrl(discoveredUrlId, {
    feedMetadata: mergeIdentityMetadata(current.feedMetadata, identity),
  })
}
