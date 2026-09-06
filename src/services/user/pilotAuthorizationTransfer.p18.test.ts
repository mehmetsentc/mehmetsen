/**
 * P18 — atomic single-pilot authorization transfer gates + diagnostic authority.
 * Pure fixtures — no Production writes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONSUMER_PILOT_BUNDLE,
  PROGRAMMATIC_OPERATOR_PILOT_UID,
  assertPilotTransferGates,
  buildPilotTransferSqlPlan,
  isPilotTransferAlreadyDone,
} from '@/services/user/pilotAuthorizationTransfer'
import {
  resolveGrantBackedPilotMatch,
  FEED_READER_DEBUG_PILOT_UID,
} from '@/lib/feed/reader/readerDebug'

const OLD = PROGRAMMATIC_OPERATOR_PILOT_UID
const NEW = 'NewHumanPilotUidXXXXXXXXXXXXXX01'
const UNRELATED = 'UnrelatedUserUidXXXXXXXXXXXXX99'

function fullBundleSet() {
  return new Set<string>([...CONSUMER_PILOT_BUNDLE])
}

describe('P18 pilot authorization transfer gates', () => {
  it('1. expected OLD → NEW transfer passes', () => {
    const gates = assertPilotTransferGates({
      oldUid: OLD,
      newUid: NEW,
      oldEnabledKeys: fullBundleSet(),
      newEnabledKeys: new Set(),
      smartFeedCount: 1,
      feedReaderCount: 1,
      nfrankCount: 1,
      distinctPilotOwners: 1,
      newFirebaseValid: true,
      newDisabled: false,
    })
    expect(gates).toEqual({ ok: true })
    const plan = buildPilotTransferSqlPlan({
      oldUid: OLD,
      newUid: NEW,
      actorId: 'test',
      transferId: 'tid-1',
    })
    expect(plan.disableOld).toHaveLength(9)
    expect(plan.enableNew).toHaveLength(9)
    expect(plan.disableOld.every((r) => r.userId === OLD)).toBe(true)
    expect(plan.enableNew.every((r) => r.userId === NEW)).toBe(true)
    expect(plan.reason).toContain('tid-1')
  })

  it('2. OLD == NEW → reject', () => {
    const gates = assertPilotTransferGates({
      oldUid: OLD,
      newUid: OLD,
      oldEnabledKeys: fullBundleSet(),
      newEnabledKeys: new Set(),
      smartFeedCount: 1,
      feedReaderCount: 1,
      nfrankCount: 1,
      distinctPilotOwners: 1,
      newFirebaseValid: true,
      newDisabled: false,
    })
    expect(gates).toEqual({ ok: false, reason: 'OLD_NEW_SAME' })
  })

  it('3. wrong OLD bundle → reject', () => {
    const partial = new Set(['SMART_FEED', 'FEED_READER_V1'])
    const gates = assertPilotTransferGates({
      oldUid: OLD,
      newUid: NEW,
      oldEnabledKeys: partial,
      newEnabledKeys: new Set(),
      smartFeedCount: 1,
      feedReaderCount: 1,
      nfrankCount: 1,
      distinctPilotOwners: 1,
      newFirebaseValid: true,
      newDisabled: false,
    })
    expect(gates).toEqual({ ok: false, reason: 'OLD_BUNDLE_MISMATCH' })
  })

  it('4. unexpected pilot count → reject', () => {
    const gates = assertPilotTransferGates({
      oldUid: OLD,
      newUid: NEW,
      oldEnabledKeys: fullBundleSet(),
      newEnabledKeys: new Set(),
      smartFeedCount: 2,
      feedReaderCount: 1,
      nfrankCount: 1,
      distinctPilotOwners: 2,
      newFirebaseValid: true,
      newDisabled: false,
    })
    expect(gates).toEqual({ ok: false, reason: 'PILOT_COUNT_UNEXPECTED' })
  })

  it('5. NEW conflicting grant state → reject', () => {
    const gates = assertPilotTransferGates({
      oldUid: OLD,
      newUid: NEW,
      oldEnabledKeys: fullBundleSet(),
      newEnabledKeys: new Set(['SMART_FEED', 'FEED_READER_V1']),
      smartFeedCount: 1,
      feedReaderCount: 1,
      nfrankCount: 1,
      distinctPilotOwners: 1,
      newFirebaseValid: true,
      newDisabled: false,
    })
    expect(gates).toEqual({ ok: false, reason: 'NEW_CONFLICTING_GRANTS' })
  })

  it('6. transaction failure model → plan is atomic batch of disable+enable', () => {
    const plan = buildPilotTransferSqlPlan({
      oldUid: OLD,
      newUid: NEW,
      actorId: 'actor',
      transferId: 'fail-sim',
    })
    // All-or-nothing: script submits one sql.transaction([...disable, ...enable]).
    expect(plan.disableOld.length + plan.enableNew.length).toBe(18)
  })

  it('7. second execution → idempotent no-op', () => {
    expect(
      isPilotTransferAlreadyDone({
        oldEnabledKeys: new Set(),
        newEnabledKeys: fullBundleSet(),
        smartFeedCount: 1,
        feedReaderCount: 1,
        nfrankCount: 1,
      })
    ).toBe(true)
    expect(
      isPilotTransferAlreadyDone({
        oldEnabledKeys: fullBundleSet(),
        newEnabledKeys: new Set(),
        smartFeedCount: 1,
        feedReaderCount: 1,
        nfrankCount: 1,
      })
    ).toBe(false)
  })

  it('8. final counts exactly 1 encoded in already-done + gates', () => {
    expect(
      isPilotTransferAlreadyDone({
        oldEnabledKeys: new Set(),
        newEnabledKeys: fullBundleSet(),
        smartFeedCount: 1,
        feedReaderCount: 1,
        nfrankCount: 2,
      })
    ).toBe(false)
  })

  it('9. unrelated grants untouched — plan only references OLD/NEW + bundle keys', () => {
    const plan = buildPilotTransferSqlPlan({
      oldUid: OLD,
      newUid: NEW,
      actorId: 'a',
      transferId: 'u',
    })
    const touched = new Set([
      ...plan.disableOld.map((r) => r.userId),
      ...plan.enableNew.map((r) => r.userId),
    ])
    expect(touched.has(UNRELATED)).toBe(false)
    expect(plan.disableOld.every((r) => CONSUMER_PILOT_BUNDLE.includes(r.featureKey as never))).toBe(
      true
    )
  })

  it('10. user/social data untouched — transfer module has no social/firestore writes', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/user/pilotAuthorizationTransfer.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/social_events|user_feed_preferences|likes|follows|firestore/i)
    expect(src).toContain('CONSUMER_PILOT_BUNDLE')
    expect(src).toContain('buildPilotTransferSqlPlan')
  })

  it('11. diagnostic authority uses grant state', () => {
    expect(
      resolveGrantBackedPilotMatch({
        currentMatchesActiveFeedReaderGrant: true,
        capabilityReady: true,
        capabilityEnabled: false,
        authenticated: true,
      })
    ).toBe(true)
    expect(
      resolveGrantBackedPilotMatch({
        currentMatchesActiveFeedReaderGrant: false,
        capabilityReady: true,
        capabilityEnabled: true,
        authenticated: true,
      })
    ).toBe(false)
    expect(
      resolveGrantBackedPilotMatch({
        capabilityReady: true,
        capabilityEnabled: true,
        authenticated: true,
      })
    ).toBe(true)
  })

  it('12. no hardcoded NEW UID in transfer / diagnostic authority', () => {
    const transfer = readFileSync(
      join(process.cwd(), 'src/services/user/pilotAuthorizationTransfer.ts'),
      'utf8'
    )
    const identity = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/pilotIdentityAuthority.server.ts'),
      'utf8'
    )
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(transfer).not.toMatch(/NewHumanPilotUid/)
    expect(identity).toContain('currentMatchesActiveFeedReaderGrant')
    expect(identity).toContain('isFeedReaderEffectiveForUser')
    expect(client).toContain('resolveGrantBackedPilotMatch')
    expect(client).not.toContain('isFeedReaderDebugPilot')
    // NEW uid must not be a constant in identity authority
    expect(identity).not.toMatch(/ACTIVE_HUMAN_PILOT_UID|NEW_PILOT_UID/)
  })

  it('13. non-pilot remains Reader disabled (grant-backed match false)', () => {
    expect(
      resolveGrantBackedPilotMatch({
        currentMatchesActiveFeedReaderGrant: false,
        capabilityReady: true,
        capabilityEnabled: false,
        authenticated: true,
      })
    ).toBe(false)
  })

  it('14. approved pilot resolves Reader enabled (grant-backed match true)', () => {
    expect(
      resolveGrantBackedPilotMatch({
        currentMatchesActiveFeedReaderGrant: true,
        capabilityReady: true,
        capabilityEnabled: true,
        authenticated: true,
      })
    ).toBe(true)
  })

  it('OLD must be programmatic operator constant', () => {
    const gates = assertPilotTransferGates({
      oldUid: 'someoneElse',
      newUid: NEW,
      oldEnabledKeys: fullBundleSet(),
      newEnabledKeys: new Set(),
      smartFeedCount: 1,
      feedReaderCount: 1,
      nfrankCount: 1,
      distinctPilotOwners: 1,
      newFirebaseValid: true,
      newDisabled: false,
    })
    expect(gates).toEqual({ ok: false, reason: 'OLD_NOT_OPERATOR' })
    expect(FEED_READER_DEBUG_PILOT_UID).toBe(OLD)
  })
})

describe('P18 transfer script + legacy verification classification', () => {
  it('atomic transfer script uses neon transaction and never prints UID fields', () => {
    const script = readFileSync(
      join(process.cwd(), 'scripts/_p18_atomic_pilot_transfer.mts'),
      'utf8'
    )
    expect(script).toContain('sql.transaction')
    expect(script).toContain('isPilotTransferAlreadyDone')
    expect(script).toContain('--bind-super-admin-email')
    expect(script).not.toMatch(/console\.log\([^)]*newUid/)
    expect(script).not.toMatch(/console\.log\([^)]*email/)
  })

  it('legacy operator verification scripts classified / guarded', () => {
    for (const rel of [
      'scripts/_verify_live_browser_feed.mjs',
      'scripts/_phase_p17_5_verify_feed_ux.mjs',
    ]) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      expect(src).toMatch(/LEGACY AUTOMATED VERIFICATION|NO LONGER VALID FOR HUMAN PILOT|P18_LEGACY/)
      expect(src).toContain('createCustomToken')
    }
  })
})
