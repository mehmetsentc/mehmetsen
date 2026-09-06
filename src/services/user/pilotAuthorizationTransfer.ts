/**
 * P18 — atomic 1→1 consumer pilot authorization transfer.
 * Pure grant logic; no UID printing; no social/data migration.
 */
import { exactUidMatch } from '@/lib/feed/reader/exactUidMatch'

export const CONSUMER_PILOT_BUNDLE = [
  'USER_PROFILES',
  'SOCIAL_GRAPH',
  'SMART_FEED',
  'SMART_FEED_RANKING_V1',
  'COLD_START_V2',
  'SMART_FEED_VIDEO',
  'SMART_FEED_TELEMETRY',
  'NFRANK_V1',
  'FEED_READER_V1',
] as const

export type ConsumerPilotFeatureKey = (typeof CONSUMER_PILOT_BUNDLE)[number]

export const PROGRAMMATIC_OPERATOR_PILOT_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

export type PilotTransferGateFailure =
  | 'OLD_NEW_SAME'
  | 'OLD_NOT_OPERATOR'
  | 'OLD_BUNDLE_MISMATCH'
  | 'PILOT_COUNT_UNEXPECTED'
  | 'NEW_CONFLICTING_GRANTS'
  | 'NEW_INVALID'
  | 'UNRELATED_COHORT'

export type PilotTransferSnapshot = {
  oldEnabledKeys: readonly string[]
  newEnabledKeys: readonly string[]
  smartFeedCount: number
  feedReaderCount: number
  nfrankCount: number
  distinctPilotOwners: number
}

export function assertPilotTransferGates(input: {
  oldUid: string
  newUid: string
  oldEnabledKeys: ReadonlySet<string>
  newEnabledKeys: ReadonlySet<string>
  smartFeedCount: number
  feedReaderCount: number
  nfrankCount: number
  distinctPilotOwners: number
  newFirebaseValid: boolean
  newDisabled: boolean
}): { ok: true } | { ok: false; reason: PilotTransferGateFailure } {
  if (exactUidMatch(input.oldUid, input.newUid)) {
    return { ok: false, reason: 'OLD_NEW_SAME' }
  }
  if (!exactUidMatch(input.oldUid, PROGRAMMATIC_OPERATOR_PILOT_UID)) {
    return { ok: false, reason: 'OLD_NOT_OPERATOR' }
  }
  if (!input.newFirebaseValid || input.newDisabled) {
    return { ok: false, reason: 'NEW_INVALID' }
  }
  for (const key of CONSUMER_PILOT_BUNDLE) {
    if (!input.oldEnabledKeys.has(key)) {
      return { ok: false, reason: 'OLD_BUNDLE_MISMATCH' }
    }
  }
  // Operator may only have the intended bundle enabled among consumer pilot keys.
  for (const key of input.oldEnabledKeys) {
    if ((CONSUMER_PILOT_BUNDLE as readonly string[]).includes(key)) continue
    // Non-bundle keys on operator are allowed historically but transfer only touches bundle.
  }
  if (
    input.smartFeedCount !== 1 ||
    input.feedReaderCount !== 1 ||
    input.nfrankCount !== 1 ||
    input.distinctPilotOwners !== 1
  ) {
    return { ok: false, reason: 'PILOT_COUNT_UNEXPECTED' }
  }
  // NEW must not already hold a different active subset that would create dual pilots mid-flight.
  // Allowed: empty, or already full bundle (idempotent path handled separately).
  const newHasAny = CONSUMER_PILOT_BUNDLE.some((k) => input.newEnabledKeys.has(k))
  const newHasAll = CONSUMER_PILOT_BUNDLE.every((k) => input.newEnabledKeys.has(k))
  if (newHasAny && !newHasAll) {
    return { ok: false, reason: 'NEW_CONFLICTING_GRANTS' }
  }
  return { ok: true }
}

export function isPilotTransferAlreadyDone(input: {
  oldEnabledKeys: ReadonlySet<string>
  newEnabledKeys: ReadonlySet<string>
  smartFeedCount: number
  feedReaderCount: number
  nfrankCount: number
}): boolean {
  const oldHasAny = CONSUMER_PILOT_BUNDLE.some((k) => input.oldEnabledKeys.has(k))
  const newHasAll = CONSUMER_PILOT_BUNDLE.every((k) => input.newEnabledKeys.has(k))
  return (
    !oldHasAny &&
    newHasAll &&
    input.smartFeedCount === 1 &&
    input.feedReaderCount === 1 &&
    input.nfrankCount === 1
  )
}

export function buildPilotTransferSqlPlan(input: {
  oldUid: string
  newUid: string
  actorId: string
  transferId: string
}): {
  disableOld: { userId: string; featureKey: string }[]
  enableNew: { userId: string; featureKey: string }[]
  reason: string
} {
  const reason = `P18 atomic single-pilot transfer ${input.transferId}`
  return {
    disableOld: CONSUMER_PILOT_BUNDLE.map((featureKey) => ({
      userId: input.oldUid,
      featureKey,
    })),
    enableNew: CONSUMER_PILOT_BUNDLE.map((featureKey) => ({
      userId: input.newUid,
      featureKey,
    })),
    reason,
  }
}
