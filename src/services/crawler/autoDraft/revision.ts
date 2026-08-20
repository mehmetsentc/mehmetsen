/**
 * Phase 4D event content fingerprint / revision.
 * Supporting source arrival after AI_DRAFT → UPDATE_AVAILABLE, no auto-regenerate.
 */

import { createHash } from 'node:crypto'

export type RevisionMember = {
  articleId: string
  sourceId: string
  contentHash: string | null
  wordCount: number | null
  title: string | null
  publishedAt: Date | null
}

export function buildEventContentFingerprint(input: {
  clusterId: string
  eventKey: string | null
  memberHashes: string[]
}): string {
  const payload = [
    input.clusterId,
    input.eventKey || '',
    ...[...input.memberHashes].sort(),
  ].join('|')
  return createHash('sha256').update(payload).digest('hex').slice(0, 40)
}

export function memberContentKey(m: RevisionMember): string {
  if (m.contentHash) return `${m.sourceId}:${m.contentHash}`
  const title = (m.title || '').trim().toLowerCase().slice(0, 80)
  const words = m.wordCount ?? 0
  const pub = m.publishedAt?.toISOString() || ''
  return `${m.sourceId}:${m.articleId}:${words}:${title}:${pub}`
}

export function fingerprintFromMembers(
  clusterId: string,
  eventKey: string | null,
  members: RevisionMember[]
): string {
  return buildEventContentFingerprint({
    clusterId,
    eventKey,
    memberHashes: members.map(memberContentKey),
  })
}

export type RevisionDecision =
  | { action: 'none'; reason: string }
  | { action: 'mark_update_available'; reason: string; fingerprint: string }
  | { action: 'record_draft_fingerprint'; reason: string; fingerprint: string }

/**
 * After supporting source arrives on an already-drafted event:
 * mark UPDATE_AVAILABLE — never auto-create a second AI job in Phase 4D.
 */
export function decideEventRevision(input: {
  currentFingerprint: string
  draftedFingerprint: string | null
  hasCompletedDraft: boolean
  hasActiveJob: boolean
}): RevisionDecision {
  if (!input.hasCompletedDraft) {
    return {
      action: 'record_draft_fingerprint',
      reason: 'no_prior_draft',
      fingerprint: input.currentFingerprint,
    }
  }
  if (input.hasActiveJob) {
    return { action: 'none', reason: 'active_job_present' }
  }
  if (!input.draftedFingerprint) {
    return {
      action: 'mark_update_available',
      reason: 'draft_without_fingerprint',
      fingerprint: input.currentFingerprint,
    }
  }
  if (input.currentFingerprint === input.draftedFingerprint) {
    return { action: 'none', reason: 'fingerprint_unchanged' }
  }
  return {
    action: 'mark_update_available',
    reason: 'fingerprint_changed',
    fingerprint: input.currentFingerprint,
  }
}
