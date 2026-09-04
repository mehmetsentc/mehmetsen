/**
 * P18.4B — Strict Firestore → PG canonical migration eligibility contract.
 *
 * READ / CLASSIFY ONLY. Never publishes, never writes PG/FS.
 * Distinct from publicReadPolicy (which answers public-read eligibility).
 */

import {
  isAutomationIdentity,
  evaluateEditorialApproval,
} from '@/services/editorial/humanReviewGate'
import {
  isExactKnownAutomationUid,
  type PublicationAuthority,
} from '@/services/editorial/publicationAuthority'
import {
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
  type PublicReadClass,
} from '@/services/editorial/publicReadPolicy'
import { isPlaceholderDraftSlug } from '@/lib/newsSlug'

/** Migration eligibility classes — not public-read classes. */
export type MigrationEligibilityClass =
  | 'MIRROR_ALREADY_CANONICAL'
  | 'PROVEN_HUMAN'
  | 'LEGACY_REVIEW_REQUIRED'
  | 'QUARANTINED'
  | 'INSUFFICIENT_EVIDENCE'

export const MIN_MIGRATION_BODY_CHARS = 120

export type MigrationFsEvidence = {
  firestoreId: string
  status?: string | null
  slug?: string | null
  title?: string | null
  content?: string | null
  htmlContent?: string | null
  publicationAuthority?: string | null
  approvedBy?: string | null
  approvedAt?: Date | number | string | null
  publishedBy?: string | null
  authorId?: string | null
  sourceUrl?: string | null
  sourceId?: string | null
  ingestionSourceId?: string | null
  publisherId?: string | null
  clusterId?: string | null
  aiAutoPublished?: boolean | null
  needsReview?: boolean | null
  needsAdminReview?: boolean | null
  seoNoindex?: boolean | null
  visibility?: string | null
  publisherType?: string | null
  rightsStatus?: string | null
  rightsBasis?: string | null
}

export type PgMirrorRow = {
  id: string
  legacyFirestoreId: string | null
  slug: string
  status: string
}

export type MigrationEligibilityInput = {
  evidence: MigrationFsEvidence
  /** Exact PG row matched by legacy_firestore_id === fsId or id === fsId. */
  pgMirror?: PgMirrorRow | null
}

export type BodyEligibility = {
  bodyExists: boolean
  bodyChars: number
  meetsMinimum: boolean
  sourceUrlExists: boolean
  rightsStatus: string | null
  rightsBasis: string | null
  /** Similarity not evaluated in foundation — contract flag only. */
  similarityEvaluated: false
  blocker?: string
}

export type HumanActorEvidence = {
  proven: boolean
  authority: string | null
  approvedBy: string | null
  publishedBy: string | null
  rejectedActor?: string
  reason: string
}

export type MigrationEligibilityResult = {
  firestoreId: string
  currentReadClass: PublicReadClass
  migrationClass: MigrationEligibilityClass
  human: HumanActorEvidence
  body: BodyEligibility
  proposedAuthority: PublicationAuthority | null
  /** Deterministic future PG id — prefer existing mirror, else FS id (continuity). */
  targetPgId: string
  targetSlug: string | null
  blockers: string[]
  /** Always false in P18.4B — planner never executes writes. */
  executable: false
}

function asTrimmed(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}

function bodyText(evidence: MigrationFsEvidence): string {
  const html = asTrimmed(evidence.htmlContent)
  const content = asTrimmed(evidence.content)
  const raw = content || html || ''
  // Strip trivial tags for length gate only (not a rewrite detector).
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function evaluateBodyEligibility(evidence: MigrationFsEvidence): BodyEligibility {
  const text = bodyText(evidence)
  const sourceUrlExists = Boolean(asTrimmed(evidence.sourceUrl))
  const meetsMinimum = text.length >= MIN_MIGRATION_BODY_CHARS
  const bodyExists = text.length > 0
  let blocker: string | undefined
  if (!bodyExists) blocker = 'body_missing'
  else if (!meetsMinimum) blocker = 'body_below_minimum'
  return {
    bodyExists,
    bodyChars: text.length,
    meetsMinimum,
    sourceUrlExists,
    rightsStatus: asTrimmed(evidence.rightsStatus),
    rightsBasis: asTrimmed(evidence.rightsBasis),
    similarityEvaluated: false,
    blocker,
  }
}

/**
 * Strict human actor proof.
 * authorId ALONE is never sufficient.
 * approvedBy / publishedBy must not be automation (reuse central gates).
 */
export function evaluateProvenHumanActor(evidence: MigrationFsEvidence): HumanActorEvidence {
  const authority = asTrimmed(evidence.publicationAuthority)?.toUpperCase() ?? null
  const approvedBy = asTrimmed(evidence.approvedBy)
  const publishedBy = asTrimmed(evidence.publishedBy)

  const actors = [approvedBy, publishedBy].filter(Boolean) as string[]

  if (authority !== 'HUMAN_EDITOR') {
    return {
      proven: false,
      authority,
      approvedBy,
      publishedBy,
      reason: 'publicationAuthority is not HUMAN_EDITOR',
    }
  }

  if (evidence.aiAutoPublished === true) {
    return {
      proven: false,
      authority,
      approvedBy,
      publishedBy,
      reason: 'aiAutoPublished=true cannot be PROVEN_HUMAN',
    }
  }

  if (!actors.length) {
    return {
      proven: false,
      authority,
      approvedBy,
      publishedBy,
      reason: 'HUMAN_EDITOR without approvedBy/publishedBy — authorId alone is insufficient',
    }
  }

  for (const actor of actors) {
    if (isExactKnownAutomationUid(actor) || isAutomationIdentity(actor)) {
      return {
        proven: false,
        authority,
        approvedBy,
        publishedBy,
        rejectedActor: actor,
        reason: `automation/system actor rejected: ${actor}`,
      }
    }
  }

  // Prefer full human-review gate when timestamp exists.
  const primary = approvedBy || publishedBy!
  if (evidence.approvedAt != null) {
    const evalResult = evaluateEditorialApproval({
      reviewerId: primary,
      reviewedAt: evidence.approvedAt,
      decision: 'APPROVED',
      isAiGenerated: Boolean(evidence.aiAutoPublished),
    })
    if (evalResult.status !== 'HUMAN_APPROVED') {
      return {
        proven: false,
        authority,
        approvedBy,
        publishedBy,
        reason: `humanReviewGate: ${evalResult.status}: ${evalResult.reason}`,
      }
    }
  }

  return {
    proven: true,
    authority,
    approvedBy,
    publishedBy,
    reason: 'HUMAN_EDITOR with non-automation approvedBy/publishedBy',
  }
}

/**
 * Idempotent target identity for a future migration (no writes).
 * Existing mirror → that PG id; else FS document id (keeps social/seen continuity).
 */
export function resolveMigrationTargetPgId(
  firestoreId: string,
  pgMirror?: PgMirrorRow | null
): string {
  if (pgMirror?.id) return pgMirror.id
  return firestoreId
}

/**
 * Strict migration eligibility classifier.
 */
export function classifyMigrationEligibility(
  input: MigrationEligibilityInput
): MigrationEligibilityResult {
  const { evidence, pgMirror } = input
  const firestoreId = evidence.firestoreId.trim()
  const blockers: string[] = []

  const readMeta = publicReadMetaFromFirestoreDoc(firestoreId, {
    title: evidence.title,
    status: evidence.status,
    slug: evidence.slug,
    visibility: evidence.visibility,
    publicationAuthority: evidence.publicationAuthority,
    publishedBy: evidence.publishedBy,
    approvedBy: evidence.approvedBy,
    authorId: evidence.authorId,
    aiAutoPublished: evidence.aiAutoPublished,
    needsReview: evidence.needsReview,
    needsAdminReview: evidence.needsAdminReview,
    seoNoindex: evidence.seoNoindex,
    publisherType: evidence.publisherType,
  })
  const currentReadClass = classifyPublicRead(readMeta)
  const human = evaluateProvenHumanActor(evidence)
  const body = evaluateBodyEligibility(evidence)
  const targetPgId = resolveMigrationTargetPgId(firestoreId, pgMirror)
  const targetSlug = asTrimmed(evidence.slug)

  if (pgMirror?.id) {
    return {
      firestoreId,
      currentReadClass,
      migrationClass: 'MIRROR_ALREADY_CANONICAL',
      human,
      body,
      proposedAuthority: null,
      targetPgId: pgMirror.id,
      targetSlug: pgMirror.slug || targetSlug,
      blockers: [],
      executable: false,
    }
  }

  if (currentReadClass === 'LEGACY_QUARANTINED' || currentReadClass === 'NOT_PUBLIC') {
    blockers.push(`public_read_class_${currentReadClass}`)
    return {
      firestoreId,
      currentReadClass,
      migrationClass: 'QUARANTINED',
      human,
      body,
      proposedAuthority: null,
      targetPgId,
      targetSlug,
      blockers,
      executable: false,
    }
  }

  if (isPlaceholderDraftSlug(evidence.slug)) {
    blockers.push('placeholder_slug')
    return {
      firestoreId,
      currentReadClass,
      migrationClass: 'QUARANTINED',
      human,
      body,
      proposedAuthority: null,
      targetPgId,
      targetSlug,
      blockers,
      executable: false,
    }
  }

  if (human.proven) {
    if (body.blocker) blockers.push(body.blocker)
    if (!targetSlug) blockers.push('slug_missing')
    return {
      firestoreId,
      currentReadClass,
      migrationClass: 'PROVEN_HUMAN',
      human,
      body,
      proposedAuthority: 'HUMAN_EDITOR',
      targetPgId,
      targetSlug,
      blockers,
      executable: false,
    }
  }

  // HUMAN_EDITOR claimed but actors failed → insufficient / quarantine automation
  if (asTrimmed(evidence.publicationAuthority)?.toUpperCase() === 'HUMAN_EDITOR') {
    if (human.rejectedActor) {
      blockers.push('automation_actor')
      return {
        firestoreId,
        currentReadClass,
        migrationClass: 'QUARANTINED',
        human,
        body,
        proposedAuthority: null,
        targetPgId,
        targetSlug,
        blockers,
        executable: false,
      }
    }
    blockers.push('human_authority_unproven')
    return {
      firestoreId,
      currentReadClass,
      migrationClass: 'INSUFFICIENT_EVIDENCE',
      human,
      body,
      proposedAuthority: null,
      targetPgId,
      targetSlug,
      blockers,
      executable: false,
    }
  }

  // Legacy public inventory without proven human — review required, never auto HUMAN_EDITOR
  if (currentReadClass === 'LEGACY_ALLOWED' || currentReadClass === 'SYSTEM_ALERT') {
    if (body.blocker) blockers.push(body.blocker)
    if (!asTrimmed(evidence.sourceUrl) && !asTrimmed(evidence.ingestionSourceId) && !asTrimmed(evidence.sourceId)) {
      blockers.push('source_provenance_missing')
    }
    // authorId-only path lands here — explicitly not PROVEN_HUMAN
    if (asTrimmed(evidence.authorId) && !asTrimmed(evidence.approvedBy) && !asTrimmed(evidence.publishedBy)) {
      blockers.push('authorId_alone_insufficient')
    }
    return {
      firestoreId,
      currentReadClass,
      migrationClass: 'LEGACY_REVIEW_REQUIRED',
      human,
      body,
      proposedAuthority: 'LEGACY',
      targetPgId,
      targetSlug,
      blockers,
      executable: false,
    }
  }

  blockers.push('insufficient_evidence')
  return {
    firestoreId,
    currentReadClass,
    migrationClass: 'INSUFFICIENT_EVIDENCE',
    human,
    body,
    proposedAuthority: null,
    targetPgId,
    targetSlug,
    blockers,
    executable: false,
  }
}

export function migrationEvidenceFromFirestoreDoc(
  id: string,
  data: Record<string, unknown>
): MigrationFsEvidence {
  return {
    firestoreId: id,
    status: typeof data.status === 'string' ? data.status : null,
    slug: typeof data.slug === 'string' ? data.slug : null,
    title: typeof data.title === 'string' ? data.title : null,
    content: typeof data.content === 'string' ? data.content : null,
    htmlContent:
      typeof data.htmlContent === 'string'
        ? data.htmlContent
        : typeof data.html_content === 'string'
          ? data.html_content
          : null,
    publicationAuthority:
      typeof data.publicationAuthority === 'string' ? data.publicationAuthority : null,
    approvedBy: typeof data.approvedBy === 'string' ? data.approvedBy : null,
    approvedAt:
      data.approvedAt instanceof Date
        ? data.approvedAt
        : typeof data.approvedAt === 'string' || typeof data.approvedAt === 'number'
          ? data.approvedAt
          : data.approvedAt &&
              typeof data.approvedAt === 'object' &&
              'toDate' in data.approvedAt &&
              typeof (data.approvedAt as { toDate: () => Date }).toDate === 'function'
            ? (data.approvedAt as { toDate: () => Date }).toDate()
            : null,
    publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : null,
    authorId: typeof data.authorId === 'string' ? data.authorId : null,
    sourceUrl:
      typeof data.sourceUrl === 'string'
        ? data.sourceUrl
        : typeof data.source_url === 'string'
          ? data.source_url
          : null,
    sourceId: typeof data.sourceId === 'string' ? data.sourceId : null,
    ingestionSourceId:
      typeof data.ingestionSourceId === 'string' ? data.ingestionSourceId : null,
    publisherId: typeof data.publisherId === 'string' ? data.publisherId : null,
    clusterId:
      typeof data.clusterId === 'string'
        ? data.clusterId
        : typeof data.cluster_id === 'string'
          ? data.cluster_id
          : null,
    aiAutoPublished: data.aiAutoPublished === true,
    needsReview: data.needsReview === true,
    needsAdminReview: data.needsAdminReview === true,
    seoNoindex: data.seoNoindex === true,
    visibility: typeof data.visibility === 'string' ? data.visibility : null,
    publisherType: typeof data.publisherType === 'string' ? data.publisherType : null,
    rightsStatus: typeof data.rightsStatus === 'string' ? data.rightsStatus : null,
    rightsBasis: typeof data.rightsBasis === 'string' ? data.rightsBasis : null,
  }
}
