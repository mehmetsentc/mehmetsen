/**
 * Feed follow / publisher identity helpers shared by card + DTO guards.
 * Follow mutations require a resolvable publishers.id / slug / publisher_sources.sourceId.
 */

export function isFollowablePublisherId(id: string | null | undefined): boolean {
  if (!id) return false
  const key = id.trim()
  if (!key || key === 'source') return false
  // Editorial AI author ids / system actors are NOT publishers.
  if (key.startsWith('ai_editor_')) return false
  if (key === 'nahaber' || key === 'system' || key === 'admin') return false
  return true
}

/** Stable client-side keys for one feed card (exact ids only — no fuzzy). */
export function feedItemIdentityKeys(item: {
  articleId: string
  slug?: string | null
  clusterId?: string | null
}): string[] {
  const keys = [item.articleId]
  if (item.slug && item.slug !== item.articleId) keys.push(item.slug)
  if (item.clusterId) keys.push(`cluster:${item.clusterId}`)
  return keys
}

export function feedItemsOverlap(
  a: { articleId: string; slug?: string | null; clusterId?: string | null },
  b: { articleId: string; slug?: string | null; clusterId?: string | null }
): boolean {
  if (a.articleId === b.articleId) return true
  if (a.slug && b.slug && a.slug === b.slug) return true
  if (a.clusterId && b.clusterId && a.clusterId === b.clusterId) return true
  return false
}
