import { createHash } from 'node:crypto'
import type { MemberEvidence, PackedSource } from './types'
import { crawlerAiDispatchConfig } from './flags'

const TIER_RANK: Record<string, number> = {
  TIER_A: 5,
  TIER_B: 4,
  TIER_C: 2,
  UNTESTED: 1,
  BLOCKED: -10,
}

export function bodyHash(body: string): string {
  return createHash('sha256').update(body.trim().replace(/\s+/g, ' ')).digest('hex').slice(0, 32)
}

export function usableBody(member: MemberEvidence): string | null {
  const body = (member.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (body.length >= 80) return body
  return null
}

export function rankMember(member: MemberEvidence, now: Date): number {
  const body = usableBody(member)
  if (!body) return -1e9
  const richness = Math.min(40, (member.wordCount || body.split(/\s+/).length) / 40)
  const freshnessHours = (() => {
    const t = member.publishedAt || member.fetchedAt
    if (!t) return 48
    return Math.max(0, (now.getTime() - t.getTime()) / 3600_000)
  })()
  const freshness = Math.max(0, 30 - freshnessHours * 0.6)
  const conf = (member.extractionConfidence ?? 0) * 25
  const health = member.healthScore * 0.25
  const tier = TIER_RANK[member.qualityTier] ?? 0
  return tier * 40 + health + conf + freshness + richness
}

export function selectEvidenceSources(
  members: MemberEvidence[],
  now = new Date(),
  max = crawlerAiDispatchConfig().maxSourcesPerEvent
): MemberEvidence[] {
  const valid = members.filter((m) => {
    if (m.isExactDuplicate) return false
    if (m.sourceStatus === 'DISABLED' || m.sourceStatus === 'PAUSED') return false
    if (m.editorialStatus === 'SKIPPED') return false
    return Boolean(usableBody(m))
  })

  const ranked = [...valid].sort((a, b) => {
    const diff = rankMember(b, now) - rankMember(a, now)
    if (diff !== 0) return diff
    return a.articleId.localeCompare(b.articleId)
  })

  const picked: MemberEvidence[] = []
  const hashes = new Set<string>()
  const sourceIds = new Set<string>()

  const tryPick = (member: MemberEvidence, requireNewSource: boolean) => {
    if (picked.length >= max) return
    if (requireNewSource && sourceIds.has(member.sourceId)) return
    const body = usableBody(member)
    if (!body) return
    const hash = member.contentHash || bodyHash(body)
    if (hashes.has(hash)) return
    hashes.add(hash)
    sourceIds.add(member.sourceId)
    picked.push(member)
  }

  for (const member of ranked) tryPick(member, true)
  for (const member of ranked) tryPick(member, false)

  return picked
}

export function toPackedSource(member: MemberEvidence): PackedSource {
  const body = usableBody(member) || ''
  return {
    articleId: member.articleId,
    sourceId: member.sourceId,
    sourceName: member.sourceName,
    publishedAt: member.publishedAt,
    title: (member.title || '').trim(),
    body,
    contentHash: member.contentHash || bodyHash(body),
  }
}
