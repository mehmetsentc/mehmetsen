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
import { KNOWN_AUTOMATION_UIDS } from '@/services/editorial/humanReviewGate'

const autoUid = [...KNOWN_AUTOMATION_UIDS][0]!

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

describe('P18.4B canonical migration eligibility', () => {
  it('existing mirror → MIRROR_ALREADY_CANONICAL (idempotent target)', () => {
    const a = classifyMigrationEligibility({
      evidence: base({ publicationAuthority: 'HUMAN_EDITOR', approvedBy: 'human_uid_1' }),
      pgMirror: { id: 'pg1', legacyFirestoreId: 'fsDoc001', slug: 'ornek-haber-slug', status: 'published' },
    })
    const b = classifyMigrationEligibility({
      evidence: base({ publicationAuthority: 'HUMAN_EDITOR', approvedBy: 'human_uid_1' }),
      pgMirror: { id: 'pg1', legacyFirestoreId: 'fsDoc001', slug: 'ornek-haber-slug', status: 'published' },
    })
    expect(a.migrationClass).toBe('MIRROR_ALREADY_CANONICAL')
    expect(a.targetPgId).toBe('pg1')
    expect(a.targetPgId).toBe(b.targetPgId)
    expect(a.executable).toBe(false)
  })

  it('quarantined → QUARANTINED', () => {
    const r = classifyMigrationEligibility({
      evidence: base({ aiAutoPublished: true, slug: 'ok-slug' }),
    })
    expect(r.migrationClass).toBe('QUARANTINED')
    expect(r.executable).toBe(false)
  })

  it('automation actor never PROVEN_HUMAN', () => {
    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: 'HUMAN_EDITOR',
        approvedBy: autoUid,
        publishedBy: autoUid,
      }),
    })
    expect(r.human.proven).toBe(false)
    expect(r.migrationClass).toBe('QUARANTINED')
  })

  it('authorId-only is NOT PROVEN_HUMAN', () => {
    const human = evaluateProvenHumanActor(
      base({
        publicationAuthority: null,
        authorId: 'looks_like_human',
        approvedBy: null,
        publishedBy: null,
      })
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
    })
    expect(r.migrationClass).toBe('LEGACY_REVIEW_REQUIRED')
    expect(r.proposedAuthority).toBe('LEGACY')
    expect(r.blockers).toContain('authorId_alone_insufficient')
  })

  it('HUMAN_EDITOR + valid human actor → PROVEN_HUMAN', () => {
    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: 'HUMAN_EDITOR',
        approvedBy: 'real_human_editor_uid',
        publishedBy: 'real_human_editor_uid',
        approvedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    })
    expect(r.migrationClass).toBe('PROVEN_HUMAN')
    expect(r.proposedAuthority).toBe('HUMAN_EDITOR')
    expect(r.human.proven).toBe(true)
    expect(r.executable).toBe(false)
  })

  it('HUMAN_EDITOR without actors → INSUFFICIENT_EVIDENCE', () => {
    const r = classifyMigrationEligibility({
      evidence: base({
        publicationAuthority: 'HUMAN_EDITOR',
        approvedBy: null,
        publishedBy: null,
        authorId: 'someone',
      }),
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
    expect(
      resolveMigrationTargetPgId('fsA', {
        id: 'pgZ',
        legacyFirestoreId: 'fsA',
        slug: 's',
        status: 'published',
      })
    ).toBe('pgZ')
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

  it('dry-run contract always sets executable false', () => {
    const r = classifyMigrationEligibility({ evidence: base() })
    expect(r.executable).toBe(false)
  })
})
