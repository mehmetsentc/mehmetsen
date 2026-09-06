/**
 * P18 — exact UID match + safe identity debug contracts (no UID/PII exposure).
 * Diagnostic observation only — must not enable Reader or write grants.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exactUidMatch } from '@/lib/feed/reader/exactUidMatch'
import { buildFeedReaderDebugBadgeLines, EMPTY_FEED_READER_DEBUG } from '@/lib/feed/reader/readerDebug'
import { decideFeedReadAction } from '@/lib/feed/reader/readerDebug'

const HIST = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
const OPERATOR = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

describe('exactUidMatch', () => {
  it('matches only exact opaque strings', () => {
    expect(exactUidMatch('abc', 'abc')).toBe(true)
    expect(exactUidMatch('abc', 'ABC')).toBe(false)
    expect(exactUidMatch('abc', 'abc ')).toBe(false)
    expect(exactUidMatch(null, 'abc')).toBe(false)
    expect(exactUidMatch('abc', undefined)).toBe(false)
  })

  it('authenticated exact historical Google match → true; different → false; operator → operator match', () => {
    expect(exactUidMatch(HIST, HIST)).toBe(true)
    expect(exactUidMatch('other-uid-zzzz', HIST)).toBe(false)
    expect(exactUidMatch(OPERATOR, OPERATOR)).toBe(true)
    expect(exactUidMatch(OPERATOR, HIST)).toBe(false)
  })
})

describe('identity debug surface safety', () => {
  it('1 unauthenticated: badge shows no UID/PII and match false/null-safe', () => {
    const lines = buildFeedReaderDebugBadgeLines({
      ...EMPTY_FEED_READER_DEBUG,
      authenticated: false,
      currentUidPresent: false,
      currentMatchesHistoricalGooglePilot: false,
      currentMatchesProgrammaticOperator: false,
    }).join('\n')
    expect(lines).toContain('authenticated: false')
    expect(lines).toContain('currentUidPresent: false')
    expect(lines).not.toMatch(/wG8WTNlW38TILLvpDLsFmt8IMlg1/)
    expect(lines).not.toMatch(/ap3scBglLIVwflfZN4qL8PKrM1A3/)
    expect(lines).not.toMatch(/Authorization|Bearer|token|email|cookie/i)
  })

  it('badge includes required identity fields', () => {
    const lines = buildFeedReaderDebugBadgeLines({
      ...EMPTY_FEED_READER_DEBUG,
      currentUidPresent: true,
      historicalGoogleCandidateExists: true,
      historicalGoogleCandidateProvider: 'GOOGLE',
      currentMatchesHistoricalGooglePilot: true,
      currentMatchesProgrammaticOperator: false,
      currentProviderType: 'GOOGLE',
    }).join('\n')
    expect(lines).toContain('currentMatchesHistoricalGooglePilot: true')
    expect(lines).toContain('currentMatchesProgrammaticOperator: false')
    expect(lines).toContain('currentProviderType: GOOGLE')
  })

  it('capability client only requests identityDebug via readerDebug query; no candidate UID param', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/capabilityClient.ts'),
      'utf8'
    )
    expect(client).toContain("opts?.readerDebug ? '?readerDebug=1' : ''")
    expect(client).toContain('identityDebug')
    expect(client).not.toMatch(/candidateUid|compareUid|targetUid/)
    expect(client).not.toContain('HISTORICAL_GOOGLE_CONSUMER_PILOT_UID')
    expect(client).not.toContain(HIST)
  })

  it('historical Google UID constant stays server-only', () => {
    const server = readFileSync(
      join(process.cwd(), 'src/lib/feed/reader/pilotIdentityAuthority.server.ts'),
      'utf8'
    )
    expect(server).toContain("import 'server-only'")
    expect(server).toContain('HISTORICAL_GOOGLE_CONSUMER_PILOT_UID')
    expect(server).toContain('exactUidMatch')
    expect(server).toContain(HIST)
    expect(server).toContain(OPERATOR)
  })

  it('capability route: identityDebug only for readerDebug=1; Bearer uid only; enabled from grant path', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/feed/v2/reader/capability/route.ts'),
      'utf8'
    )
    expect(route).toContain("searchParams.get('readerDebug') === '1'")
    expect(route).toContain('buildPilotIdentityDebug')
    expect(route).toContain('identityDebug')
    expect(route).toContain('isFeedReaderEffectiveForUser')
    expect(route).toContain('verifyFirebaseIdToken')
    expect(route).not.toMatch(/searchParams\.get\(['\"]candidate/)
    expect(route).not.toMatch(/body\.uid|json\.uid/)
  })

  it('8 identity match does NOT enable Reader — decideFeedReadAction ignores match', () => {
    expect(
      decideFeedReadAction({
        authLoading: false,
        capabilityReady: true,
        capabilityEnabled: false,
        capabilityError: false,
      }).decision
    ).toBe('CANONICAL_FALLBACK')
  })

  it('10 normal capability response remains compatible (enabled/authenticated/feature)', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/feed/v2/reader/capability/route.ts'),
      'utf8'
    )
    expect(route).toContain('enabled')
    expect(route).toContain("feature: 'FEED_READER_V1'")
    expect(route).toContain('authenticated: Boolean(auth?.uid)')
  })

  it('SmartFeedClient does not change grant semantics via identity debug', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('readerDebug: readerDebugQuery')
    expect(client).toContain('identityDebug: result.identityDebug')
    expect(client).not.toMatch(/currentMatchesHistoricalGooglePilot\s*&&/)
    expect(client).not.toMatch(/setFeedReaderEnabled\(\s*true\s*\)/)
  })
})
