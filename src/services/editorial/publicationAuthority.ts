/**
 * P18.1 — Universal publication authority boundary.
 *
 * Every NEW transition into public `published` must declare an explicit authority.
 * Fail-closed: missing / forged / mismatched authority → reject.
 *
 * Authorities:
 * - HUMAN_EDITOR — authenticated human editorial approval (reuse humanReviewGate)
 * - SYSTEM_ALERT — narrowly scoped trusted system alerts (AFAD only in P18.1)
 * - LEGACY — historical / migration utilities only (not for new Production writers)
 */

import {
  assertHumanEditorialApproval,
  isAutomationIdentity,
  KNOWN_AUTOMATION_UIDS,
  type EditorialApprovalEvaluation,
} from './humanReviewGate'
import {
  checkTextSimilarity,
  validatePublicationRights,
  type OverlapCategory,
  type RightsCheckResult,
} from './editorialSimilarityGate'

export type PublicationAuthority = 'HUMAN_EDITOR' | 'SYSTEM_ALERT' | 'LEGACY'

/** Only trusted AFAD earthquake ingestion may use SYSTEM_ALERT in P18.1. */
export const SYSTEM_ALERT_KIND_AFAD_EARTHQUAKE = 'AFAD_EARTHQUAKE' as const
export type SystemAlertKind = typeof SYSTEM_ALERT_KIND_AFAD_EARTHQUAKE

export interface HumanPublicationActor {
  uid: string
  displayName?: string | null
}

export interface HumanEditorPublicationRequest {
  authority: 'HUMAN_EDITOR'
  actorUid: string
  actorDisplayName?: string | null
  approvedAt?: Date | number | string | null
  /** Optional source-derived body for HIGH_OVERLAP enforcement when available. */
  editorialText?: string | null
  sourceText?: string | null
  rightsStatus?: string | null
  rightsBasis?: string | null
}

export interface SystemAlertPublicationRequest {
  authority: 'SYSTEM_ALERT'
  kind: SystemAlertKind
  /** Must match the trusted AFAD worker identity — not caller-supplied generic strings. */
  sourceIdentity: 'AFAD'
  ingestionSourceId: 'afad'
  aiGenerated?: boolean
}

export interface LegacyPublicationRequest {
  authority: 'LEGACY'
  reason: string
}

export type PublicationRequest =
  | HumanEditorPublicationRequest
  | SystemAlertPublicationRequest
  | LegacyPublicationRequest

export interface PublicationAuthorizationResult {
  authority: PublicationAuthority
  approvedBy: string | null
  approvedAt: number
  publishedBy: string | null
  publishedAt: number
  systemAlertKind?: SystemAlertKind
  humanReview?: EditorialApprovalEvaluation
  similarity?: {
    evaluated: boolean
    overlapCategory?: OverlapCategory
    rights?: RightsCheckResult
    limitation?: string
  }
}

export class PublicationAuthorityError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PublicationAuthorityError'
    this.code = code
  }
}

/**
 * Exact Firebase UID membership in KNOWN_AUTOMATION_UIDS — no case folding,
 * no permutations. Empty / whitespace-only actors are rejected separately.
 */
export function isExactKnownAutomationUid(uid: string): boolean {
  return KNOWN_AUTOMATION_UIDS.has(uid)
}

function requireNonEmptyActorUid(uid: string | null | undefined): string {
  if (typeof uid !== 'string' || uid.length === 0 || uid.trim().length === 0) {
    throw new PublicationAuthorityError(
      'MISSING_ACTOR',
      'PUBLICATION_AUTHORITY_REJECTED: HUMAN_EDITOR requires a non-empty actor UID'
    )
  }
  // Exact identity for known automation set (no trim / case fold for Set lookup).
  if (isExactKnownAutomationUid(uid) || isExactKnownAutomationUid(uid.trim())) {
    throw new PublicationAuthorityError(
      'AUTOMATION_UID',
      `PUBLICATION_AUTHORITY_REJECTED: automation UID cannot authorize HUMAN_EDITOR (${uid})`
    )
  }
  // System / bot prefixes still rejected via existing gate helper (not UID permutation).
  if (isAutomationIdentity(uid.trim())) {
    throw new PublicationAuthorityError(
      'SYSTEM_IDENTITY',
      `PUBLICATION_AUTHORITY_REJECTED: system/bot identity cannot authorize HUMAN_EDITOR (${uid})`
    )
  }
  return uid.trim()
}

/**
 * Enforce HIGH_OVERLAP protection when both editorial + source texts are present.
 * Missing source context → do not fabricate PASS; record architectural limitation.
 */
export function evaluateHumanEditorSimilarity(input: {
  editorialText?: string | null
  sourceText?: string | null
  rightsStatus?: string | null
  rightsBasis?: string | null
}): PublicationAuthorizationResult['similarity'] {
  const editorial = String(input.editorialText || '').trim()
  const source = String(input.sourceText || '').trim()

  if (!editorial || !source) {
    return {
      evaluated: false,
      limitation:
        'INSUFFICIENT_SOURCE_CONTEXT: similarity not evaluated (no fabricated PASS)',
    }
  }

  const sim = checkTextSimilarity(editorial, source)
  const rights = validatePublicationRights({
    canonicalText: editorial,
    rawSourceText: source,
    rightsStatus: input.rightsStatus,
    rightsBasis: input.rightsBasis,
  })

  if (!rights.allowed) {
    throw new PublicationAuthorityError(
      'HIGH_OVERLAP_BLOCKED',
      `PUBLICATION_AUTHORITY_REJECTED: HIGH_OVERLAP blocked (${rights.reason})`
    )
  }

  return {
    evaluated: true,
    overlapCategory: sim.overlapCategory,
    rights,
  }
}

/**
 * Narrow SYSTEM_ALERT admission — AFAD earthquake path only.
 * Arbitrary callers cannot obtain SYSTEM_ALERT by passing authority strings.
 */
export function assertTrustedAfadSystemAlert(input: {
  kind: string
  sourceIdentity: string
  ingestionSourceId: string
  aiGenerated?: boolean
  /** Must be the internal module token — never accept from HTTP bodies. */
  trustedPathToken: string
}): void {
  const AFAD_PATH_TOKEN = 'nahaber.internal.afadWorker.v1'
  if (input.trustedPathToken !== AFAD_PATH_TOKEN) {
    throw new PublicationAuthorityError(
      'SYSTEM_ALERT_UNTRUSTED_PATH',
      'PUBLICATION_AUTHORITY_REJECTED: SYSTEM_ALERT requires trusted AFAD ingestion path'
    )
  }
  if (input.kind !== SYSTEM_ALERT_KIND_AFAD_EARTHQUAKE) {
    throw new PublicationAuthorityError(
      'SYSTEM_ALERT_KIND',
      'PUBLICATION_AUTHORITY_REJECTED: unsupported SYSTEM_ALERT kind'
    )
  }
  if (input.sourceIdentity !== 'AFAD') {
    throw new PublicationAuthorityError(
      'SYSTEM_ALERT_SOURCE',
      'PUBLICATION_AUTHORITY_REJECTED: SYSTEM_ALERT sourceIdentity must be AFAD'
    )
  }
  if (input.ingestionSourceId !== 'afad') {
    throw new PublicationAuthorityError(
      'SYSTEM_ALERT_INGESTION',
      'PUBLICATION_AUTHORITY_REJECTED: SYSTEM_ALERT ingestionSourceId must be afad'
    )
  }
  if (input.aiGenerated === true) {
    throw new PublicationAuthorityError(
      'SYSTEM_ALERT_AI',
      'PUBLICATION_AUTHORITY_REJECTED: SYSTEM_ALERT must be deterministic non-AI'
    )
  }
}

/** Exported only for the AFAD worker module — not for API routes. */
export const AFAD_SYSTEM_ALERT_PATH_TOKEN = 'nahaber.internal.afadWorker.v1'

/**
 * Central fail-closed publication authorization.
 * No implicit default to HUMAN_EDITOR.
 */
export function authorizePublication(
  request: PublicationRequest | null | undefined
): PublicationAuthorizationResult {
  if (!request || !request.authority) {
    throw new PublicationAuthorityError(
      'MISSING_AUTHORITY',
      'PUBLICATION_AUTHORITY_REJECTED: explicit publication authority required (fail-closed)'
    )
  }

  const now = Date.now()

  if (request.authority === 'HUMAN_EDITOR') {
    const actorUid = requireNonEmptyActorUid(request.actorUid)
    const approvedAt = request.approvedAt ?? now
    const humanReview = assertHumanEditorialApproval({
      reviewerId: actorUid,
      reviewerDisplayName: request.actorDisplayName,
      decision: 'APPROVED',
      reviewedAt: approvedAt,
      isAiGenerated: false,
    })

    const similarity = evaluateHumanEditorSimilarity({
      editorialText: request.editorialText,
      sourceText: request.sourceText,
      rightsStatus: request.rightsStatus,
      rightsBasis: request.rightsBasis,
    })

    const approvedAtMs =
      humanReview.reviewedAt?.getTime() ??
      (typeof approvedAt === 'number' ? approvedAt : new Date(approvedAt).getTime())

    return {
      authority: 'HUMAN_EDITOR',
      approvedBy: actorUid,
      approvedAt: approvedAtMs,
      publishedBy: actorUid,
      publishedAt: now,
      humanReview,
      similarity,
    }
  }

  if (request.authority === 'SYSTEM_ALERT') {
    // SYSTEM_ALERT requests reaching here without prior trusted-path assert are rejected.
    // Callers must use authorizeAfadSystemAlertPublication().
    throw new PublicationAuthorityError(
      'SYSTEM_ALERT_DIRECT',
      'PUBLICATION_AUTHORITY_REJECTED: SYSTEM_ALERT must use authorizeAfadSystemAlertPublication'
    )
  }

  if (request.authority === 'LEGACY') {
    throw new PublicationAuthorityError(
      'LEGACY_FORBIDDEN',
      `PUBLICATION_AUTHORITY_REJECTED: LEGACY authority is not allowed for new publications (${request.reason})`
    )
  }

  throw new PublicationAuthorityError(
    'UNKNOWN_AUTHORITY',
    'PUBLICATION_AUTHORITY_REJECTED: unknown publication authority'
  )
}

/**
 * Sole Production entry for AFAD SYSTEM_ALERT publication authorization.
 */
export function authorizeAfadSystemAlertPublication(input: {
  sourceIdentity: 'AFAD'
  ingestionSourceId: 'afad'
  aiGenerated?: boolean
  trustedPathToken: string
}): PublicationAuthorizationResult {
  assertTrustedAfadSystemAlert({
    kind: SYSTEM_ALERT_KIND_AFAD_EARTHQUAKE,
    sourceIdentity: input.sourceIdentity,
    ingestionSourceId: input.ingestionSourceId,
    aiGenerated: input.aiGenerated,
    trustedPathToken: input.trustedPathToken,
  })

  const now = Date.now()
  return {
    authority: 'SYSTEM_ALERT',
    approvedBy: 'SYSTEM_ALERT:AFAD_EARTHQUAKE',
    approvedAt: now,
    publishedBy: 'SYSTEM_ALERT:AFAD_EARTHQUAKE',
    publishedAt: now,
    systemAlertKind: SYSTEM_ALERT_KIND_AFAD_EARTHQUAKE,
  }
}

/** Provenance fields to merge into a newly published news document. */
export function publicationProvenanceFields(
  authz: PublicationAuthorizationResult
): Record<string, unknown> {
  return {
    publicationAuthority: authz.authority,
    approvedBy: authz.approvedBy,
    approvedAt: authz.approvedAt,
    publishedBy: authz.publishedBy,
    publishedAt: authz.publishedAt,
    ...(authz.systemAlertKind
      ? { systemAlertKind: authz.systemAlertKind }
      : {}),
    ...(authz.similarity
      ? {
          publicationSimilarityEvaluated: authz.similarity.evaluated,
          ...(authz.similarity.overlapCategory
            ? { publicationOverlapCategory: authz.similarity.overlapCategory }
            : {}),
          ...(authz.similarity.limitation
            ? { publicationSimilarityLimitation: authz.similarity.limitation }
            : {}),
        }
      : {}),
  }
}
