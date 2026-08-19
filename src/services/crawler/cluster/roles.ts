import type { NewsSourceRecord, RawArticleRecord } from '../types'

export const MEMBERSHIP_ROLES = ['PRIMARY', 'SUPPORTING', 'DUPLICATE', 'LOW_QUALITY', 'MATERIAL_UPDATE'] as const
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number]

export function assignMembershipRole(opts: {
  isPrimary: boolean
  isExactDuplicate: boolean
  qualityStatus: string
  isMaterialUpdate: boolean
}): MembershipRole {
  if (opts.isPrimary) return 'PRIMARY'
  if (opts.isExactDuplicate) return 'DUPLICATE'
  if (opts.qualityStatus === 'TOO_SHORT' || opts.qualityStatus === 'EXTRACTION_FAILED' || opts.qualityStatus === 'FAILED' || opts.qualityStatus === 'STALE') {
    return 'LOW_QUALITY'
  }
  if (opts.isMaterialUpdate) return 'MATERIAL_UPDATE'
  return 'SUPPORTING'
}

export function independentSourceCount(
  members: Array<{ article: Pick<RawArticleRecord, 'sourceId' | 'isExactDuplicate' | 'contentHash'>; source: NewsSourceRecord | null }>
): number {
  const seenSources = new Set<string>()
  const seenHashes = new Set<string>()
  let count = 0
  for (const row of members) {
    if (row.article.isExactDuplicate) continue
    const hash = row.article.contentHash
    if (hash && seenHashes.has(hash)) continue
    if (seenSources.has(row.article.sourceId)) continue
    seenSources.add(row.article.sourceId)
    if (hash) seenHashes.add(hash)
    count += 1
  }
  return count
}

export function futureAiUnitsForEvent(articleCount: number): { eventCount: 1; articleCount: number; futureAiJobs: 1; providerRequests: 0 } {
  void articleCount
  return { eventCount: 1, articleCount, futureAiJobs: 1, providerRequests: 0 }
}
