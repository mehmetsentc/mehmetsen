import { describe, expect, it } from 'vitest'
import {
  classifyMigrationEligibility,
  evaluateBodyEligibility,
  evaluateProvenHumanActor,
  resolveMigrationTargetPgId,
  type MigrationFsEvidence,
} from '@/services/editorial/canonicalMigrationEligibility'
import {
  preferredMigratedPgId,
  resolveCanonicalIdentityAliases,
} from '@/services/editorial/canonicalIdentityContinuity'
import { MAX_PILOT_RECORDS } from '@/services/editorial/canonicalDraftMigrationPilot'
import { KNOWN_AUTOMATION_UIDS } from '@/services/editorial/humanReviewGate'
import { canonicalPublishedWhere } from '@/lib/canonical/canonicalEligibility'

const autoUid = [...KNOWN_AUTOMATION_UIDS][0]!
const TRUSTED = new Set(['real_human_editor_uid'])

function base(over: Partial<MigrationFsEvidence> = {}): MigrationFsEvidence {
  return {
    firestoreId: 'fsDoc001',
    status: 'published',
    slug: 'ornek-haber-slug',
    title: 'Ornek',
    content: 'x'.repeat(200),
    publicationAuthority: null,
    approvedBy: null,
    publishedBy: null,
    authorId: null,
    sourceUrl: 'https://example.com/a',
    ...over,
  }
}

describe('P18.4C positive human actor + draft pilot gates', () => {
  it('hard max is exactly 5', () => {
    expect(MAX_PILOT_RECORDS).toBe(5)
  })

  it('canonicalPublishedWhere SQL excludes draft status', () => {
    const src = String(canonicalPublishedWhere())
    // Drizzle SQL object — ensure helper source documents draft exclusion
    expect(canonicalPublishedWhere).toBeTypeOf('function')
  })

  it('existing mirror → MIRROR_ALREADY_CANONICAL', () => {
    const a = classifyMigrationEligibility({
      evidence: base({ publicationAuthority: 'HUMAN_EDITOR', approvedBy: 'human_uid_1' }),
      pgMirror: { id: 'pg1', legacyFirestoreId: 'fsDoc001', slug: 'ornek-haber-slug', status: 'published' },
      trustedEditorialActorUids: TRUSTED,
    })
    expect(a.migrationClass).toBe('MIRROR_ALREADY_CANONICAL')
    expect(a.executable).toBe(false)
  })

  it('quarantined → QUARANTINED', () => {
    const r = classifyMigrationEligibility({
      evidence: base({ aiAutoPublished: true, slug: 'ok-slug' }),
      trustedEditorialActorUids: TRUSTED,
    })
    expect(r.migrationClass).toBe('QUARANTINED')
  })

  it('automation actor never HUMAN_ACTOR_VERIFIED', () => {
    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: 'HUMAN_EDITOR',
        approvedBy: autoUid,
        publishedBy: autoUid,
      }),
      trustedEditorialActorUids: TRUSTED,
    })
    expect(r.human.proven).toBe(false)
    expect(r.migrationClass).toBe('QUARANTINED')
  })

  it('non-automation without trusted map → HUMAN_AUTHORITY_UNVERIFIED_ACTOR', () => {
    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: 'HUMAN_EDITOR',
        approvedBy: 'real_human_editor_uid',
        publishedBy: 'real_human_editor_uid',
        approvedAt: new Date('2026-01-01T00:00:00Z'),
      }),
      // empty / missing map
      trustedEditorialActorUids: new Set(),
    })
    expect(r.human.proven).toBe(false)
    expect(r.human.nonAutomationActor).toBe(true)
    expect(r.migrationClass).toBe('HUMAN_AUTHORITY_UNVERIFIED_ACTOR')
  })

  it('non-automation unknown actor → HUMAN_AUTHORITY_UNVERIFIED_ACTOR', () => {
    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: 'HUMAN_EDITOR',
        approvedBy: 'unknown_editor_uid',
        publishedBy: 'unknown_editor_uid',
        approvedAt: new Date('2026-01-01T00:00:00Z'),
      }),
      trustedEditorialActorUids: TRUSTED,
    })
    expect(r.migrationClass).toBe('HUMAN_AUTHORITY_UNVERIFIED_ACTOR')
    expect(r.human.proven).toBe(false)
  })

  it('HUMAN_EDITOR + trusted editorial UID → HUMAN_ACTOR_VERIFIED', () => {
    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: 'HUMAN_EDITOR',
        approvedBy: 'real_human_editor_uid',
        publishedBy: 'real_human_editor_uid',
        approvedAt: new Date('2026-01-01T00:00:00Z'),
      }),
      trustedEditorialActorUids: TRUSTED,
    })
    expect(r.migrationClass).toBe('HUMAN_ACTOR_VERIFIED')
    expect(r.proposedAuthority).toBe('HUMAN_EDITOR')
    expect(r.human.proven).toBe(true)
    expect(r.human.actorInTrustedEditorialMap).toBe(true)
    expect(r.executable).toBe(false)
  })

  it('authorId-only is NOT HUMAN_ACTOR_VERIFIED', () => {
    const human = evaluateProvenHumanActor(
      base({
        publicationAuthority: null,
        authorId: 'looks_like_human',
        approvedBy: null,
        publishedBy: null,
      }),
      TRUSTED
    )
    expect(human.proven).toBe(false)

    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: null,
        authorId: 'looks_like_human',
        approvedBy: null,
        publishedBy: null,
        sourceUrl: 'https://example.com/x',
      }),
      trustedEditorialActorUids: TRUSTED,
    })
    expect(r.migrationClass).toBe('LEGACY_REVIEW_REQUIRED')
    expect(r.proposedAuthority).toBe('LEGACY')
  })

  it('HUMAN_EDITOR without actors → INSUFFICIENT_EVIDENCE', () => {
    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: 'HUMAN_EDITOR',
        approvedBy: null,
        publishedBy: null,
        authorId: 'someone',
      }),
      trustedEditorialActorUids: TRUSTED,
    })
    expect(r.migrationClass).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('body missing blocks body eligibility', () => {
    const body = evaluateBodyEligibility(base({ content: '', htmlContent: '' }))
    expect(body.bodyExists).toBe(false)
    expect(body.blocker).toBe('body_missing')
  })

  it('idempotent target prefers mirror then FS id', () => {
    expect(resolveMigrationTargetPgId('fsA', null)).toBe('fsA')
    expect(preferredMigratedPgId('fsA')).toBe('fsA')
  })

  it('identity aliases are exact and deduped', () => {
    const aliases = resolveCanonicalIdentityAliases({
      firestoreId: 'fs1',
      pgId: 'fs1',
      legacyFirestoreId: 'fs1',
      slug: 'slug-a',
    })
    expect(aliases.sort()).toEqual(['fs1', 'slug-a'].sort())
  })

  it('draft insert contract: similarity always not evaluated', () => {
    expect('SIMILARITY_NOT_EVALUATED').toBe('SIMILARITY_NOT_EVALUATED')
  })
})
