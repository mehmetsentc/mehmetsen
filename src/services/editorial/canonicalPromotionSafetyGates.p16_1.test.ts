import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CANONICAL_RIGHTS_AUDIT_ACTIONS,
  CANONICAL_RIGHTS_AUDIT_ENTITY_TYPE,
  sanitizeCanonicalAuditSnapshot,
} from '@/services/editorial/canonicalRightsAudit'
import {
  SEED_DEMO_CANONICAL_NEWS_IDS,
  excludeSeedDemoCanonicalNewsRows,
  isSeedDemoCanonicalNewsId,
} from '@/services/editorial/canonicalRightsReviewQueue'

function src(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

describe('P16.1 Task 2/6 — append-only audit trail shape', () => {
  it('reuses the existing crawler_editorial_audit table, not a new table', () => {
    const auditSrc = src('src/services/editorial/canonicalRightsAudit.ts')
    expect(auditSrc).toContain("from '@/db/schema/crawler'")
    expect(auditSrc).toContain('crawlerEditorialAudit')
    expect(auditSrc).not.toMatch(/pgTable\(/)
    expect(CANONICAL_RIGHTS_AUDIT_ENTITY_TYPE).toBe('canonical_news')
  })

  it('covers every required rights/blocker/publish/revoke event type', () => {
    const required = [
      'RIGHTS_PENDING',
      'RIGHTS_CLEARED',
      'RIGHTS_REWRITE_REQUIRED',
      'RIGHTS_DO_NOT_PUBLISH',
      'BLOCKER_SET',
      'BLOCKER_CLEARED',
      'PUBLISHED',
      'REVOKED',
    ]
    for (const action of required) {
      expect(CANONICAL_RIGHTS_AUDIT_ACTIONS).toContain(action)
    }
  })

  it('audit write is best-effort and never throws from the *Safe wrapper', () => {
    const auditSrc = src('src/services/editorial/canonicalRightsAudit.ts')
    expect(auditSrc).toContain('recordCanonicalRightsAuditEventSafe')
    expect(auditSrc).toMatch(/catch \(err\)/)
    expect(auditSrc).toContain('console.error')
  })

  it('append-only: no update()/delete() against crawlerEditorialAudit in the audit module', () => {
    const auditSrc = src('src/services/editorial/canonicalRightsAudit.ts')
    expect(auditSrc).not.toMatch(/\.update\(crawlerEditorialAudit\)/)
    expect(auditSrc).not.toMatch(/\.delete\(crawlerEditorialAudit\)/)
  })
})

describe('P16.1 Task 3 — source-overlap snapshot never carries raw body text', () => {
  it('strips forbidden body-like keys', () => {
    const clean = sanitizeCanonicalAuditSnapshot({
      similarity: 0.62,
      risk: 'HIGH_SOURCE_OVERLAP',
      content: 'this should never be persisted '.repeat(20),
      sourceBody: 'raw scraped text',
      canonicalBody: 'raw canonical text',
      html: '<p>raw html</p>',
    })
    expect(clean).not.toBeNull()
    expect(clean).not.toHaveProperty('content')
    expect(clean).not.toHaveProperty('sourceBody')
    expect(clean).not.toHaveProperty('canonicalBody')
    expect(clean).not.toHaveProperty('html')
    expect(clean!.similarity).toBe(0.62)
    expect(clean!.risk).toBe('HIGH_SOURCE_OVERLAP')
  })

  it('drops long free-text string fields even under an unexpected key name', () => {
    const clean = sanitizeCanonicalAuditSnapshot({
      note: 'x'.repeat(1000),
      shortField: 'kept',
    })
    expect(clean).not.toHaveProperty('note')
    expect(clean!.shortField).toBe('kept')
  })

  it('rights route fetches a live overlap snapshot at decision time (non-blocking)', () => {
    const routeSrc = src('src/app/api/admin/canonical-news/[id]/rights/route.ts')
    expect(routeSrc).toContain('auditCanonicalDraftSourceOverlap')
    expect(routeSrc).toContain('sourceOverlapSnapshot')
    expect(routeSrc).toMatch(/catch \(overlapErr\)/)
  })

  it('never selects raw content/htmlContent into the persisted overlap snapshot object', () => {
    const routeSrc = src('src/app/api/admin/canonical-news/[id]/rights/route.ts')
    expect(routeSrc).toContain('overlapSnapshot = {')
    // Word-boundary matches only -- sourceBodyChars/canonicalBodyChars (safe
    // char counts) legitimately contain "sourceBody"/"canonicalBody" as a
    // *prefix*, so a plain substring check would false-positive on them.
    expect(routeSrc).not.toMatch(/overlap\.content\b/)
    expect(routeSrc).not.toMatch(/overlap\.sourceBody\b/)
    expect(routeSrc).not.toMatch(/overlap\.canonicalBody\b/)
    expect(routeSrc).not.toMatch(/overlap\.htmlContent\b/)
    expect(routeSrc).toContain('overlap.sourceBodyChars')
    expect(routeSrc).toContain('overlap.canonicalBodyChars')
  })

  it('finalize-cohort reuses its already-computed overlap audit instead of re-fetching', () => {
    const routeSrc = src(
      'src/app/api/admin/canonical-news/rights-queue/finalize-cohort/route.ts'
    )
    expect(routeSrc).toContain('overlapSnapshot')
    expect(routeSrc).toContain('sourceOverlapSnapshot: c.overlapSnapshot')
  })
})

describe('P16.1 Task 4 — revoke/unpublish semantics', () => {
  const revokeSrc = () => src('src/services/editorial/canonicalNewsRevoke.ts')

  it('reuses the existing draft status — no new status value invented', () => {
    const s = revokeSrc()
    expect(s).toContain("status: 'draft'")
    expect(s).not.toMatch(/pgEnum\(/)
  })

  it('conditional UPDATE guards on status=published (race-safe, mirrors publish)', () => {
    const s = revokeSrc()
    expect(s).toContain("eq(news.status, 'published')")
    expect(s).toContain('.returning(')
  })

  it('idempotent: already-draft rows return alreadyUnpublished without erroring', () => {
    const s = revokeSrc()
    expect(s).toContain('alreadyUnpublished: true')
    expect(s).toMatch(/row\.status === 'draft'/)
  })

  it('race loss path re-checks current status before declaring failure', () => {
    const s = revokeSrc()
    expect(s).toContain('revoke_race_lost')
    expect(s).toMatch(/cur\?\.status === 'draft'/)
  })

  it('preserves identity, provenance, content and rights fields byte-for-byte', () => {
    const s = revokeSrc()
    for (const guard of [
      'identity_mutated_on_revoke',
      'legacy_id_mutated_on_revoke',
      'migration_batch_mutated_on_revoke',
      'content_mutated_on_revoke',
      'rights_mutated_on_revoke',
      'rights_actor_mutated_on_revoke',
      'authority_mutated_on_revoke',
      'publication_provenance_mutated_on_revoke',
    ]) {
      expect(s).toContain(guard)
    }
  })

  it('does NOT clear publishedAt/publishedBy — original publish provenance stays reconstructable', () => {
    const s = revokeSrc()
    expect(s).not.toMatch(/publishedAt:\s*null/)
    expect(s).not.toMatch(/publishedBy:\s*null/)
  })

  it('only verifies the revoking actor, not a possibly-null rightsDecidedBy', () => {
    const s = revokeSrc()
    expect(s).toContain('assertTrustedEditorialHumanActor(actorUid)')
    expect(s).not.toContain('assertTrustedEditorialHumanActor(row.rightsDecidedBy')
  })

  it('exposes a deterministic firestoreFallbackRisk flag and never reads/writes Firestore', () => {
    const s = revokeSrc()
    expect(s).toContain('firestoreFallbackRisk')
    expect(s).toContain('Boolean(row.legacyFirestoreId)')
    // The flag is a deterministic, code-level warning derived only from the
    // PG row's own legacyFirestoreId column -- this module must never import
    // or call into the Firestore admin SDK to compute or act on it.
    expect(s).not.toMatch(/getAdminFirestore/)
    expect(s).not.toMatch(/collection\(Collections\./)
    expect(s).not.toMatch(/firebase-admin/)
  })

  it('writes a REVOKED audit event only on a real transition, not on idempotent returns', () => {
    const s = revokeSrc()
    const afterUpdateIdx = s.indexOf('const rev = updated[0]!')
    const auditIdx = s.indexOf("action: 'REVOKED'")
    expect(afterUpdateIdx).toBeGreaterThan(-1)
    expect(auditIdx).toBeGreaterThan(afterUpdateIdx)
  })
})

describe('P16.1 Task 4 — revoke API route', () => {
  const routeSrc = () =>
    src('src/app/api/admin/canonical-news/[id]/revoke/route.ts')

  it('uses the same news:publish scope as publish — never easier to trigger', () => {
    const s = routeSrc()
    expect(s).toContain("verifyCmsToken(request, 'news:publish')")
  })

  it('actor is session-derived only — client body cannot spoof actorUid', () => {
    const s = routeSrc()
    expect(s).toContain('actorUid: auth.uid')
    expect(s).not.toMatch(/actorUid:\s*body/)
    expect(s).toContain('client_override_rejected')
    expect(s).toContain("'status'")
  })

  it('never publishes and never mutates rights fields', () => {
    const s = routeSrc()
    expect(s).not.toMatch(/status:\s*'published'/)
    expect(s).toContain('revokeCanonicalNews')
  })
})

describe('P16.1 Task 5 — Firestore fallback consequence (code-level, must not be hidden)', () => {
  it('canonicalPublishedWhere/A3 memory/sitemaps are PG-only (no Firestore query)', () => {
    const eligibility = src('src/lib/canonical/canonicalEligibility.ts')
    expect(eligibility).not.toMatch(/getAdminFirestore/)

    const memory = src('src/services/editorial/editorialMemoryRetrieval.ts')
    expect(memory).not.toMatch(/getAdminFirestore/)

    const sitemap = src('src/app/news-sitemap.xml/route.ts')
    expect(sitemap).toContain('intentionally excludes generic Firestore legacy corpus')
  })

  it('getNewsBySlug falls back from PG canonical to Firestore by the same slug', () => {
    const svc = src('src/services/newsService.server.ts')
    const fnMatch = svc.match(
      /export async function getNewsBySlug[\s\S]*?\n\}\n/
    )
    expect(fnMatch).not.toBeNull()
    const fn = fnMatch![0]
    expect(fn).toContain('getCanonicalNewsBySlug')
    expect(fn).toContain('getLegacyNewsBySlugCached')
  })

  it('migration pilot copies the Firestore slug verbatim (so PG and Firestore share the exact slug)', () => {
    const pilot = src('src/services/editorial/canonicalDraftMigrationPilot.ts')
    expect(pilot).toContain('const slug = asString(data.slug)')
  })

  it('revoke result surfaces firestoreFallbackRisk instead of claiming full takedown safety', () => {
    const route = src('src/app/api/admin/canonical-news/[id]/revoke/route.ts')
    expect(route).toContain('firestoreFallbackRisk')
  })
})

describe('P16.1 Task 7 — seed/demo isolation', () => {
  it('shared constant matches the known pilot/seed ids (single source of truth)', () => {
    expect([...SEED_DEMO_CANONICAL_NEWS_IDS].sort()).toEqual(
      ['0ALMkrRCE3LQqubviNZh', '0SdmPVCnO8pVAbMENA9f', '0XYEJVwyi7oILuYKf91R'].sort()
    )
  })

  it('isSeedDemoCanonicalNewsId is exact-match only, never a real cohort id', () => {
    expect(isSeedDemoCanonicalNewsId('0SdmPVCnO8pVAbMENA9f')).toBe(true)
    expect(isSeedDemoCanonicalNewsId('wUzimisXG1JZZqdRdHt5')).toBe(false)
    expect(isSeedDemoCanonicalNewsId(null)).toBe(false)
    expect(isSeedDemoCanonicalNewsId('')).toBe(false)
  })

  it('excludeSeedDemoCanonicalNewsRows strips only seed rows, keeps the rest', () => {
    const rows = [
      { id: '0SdmPVCnO8pVAbMENA9f', title: 'seed' },
      { id: 'wUzimisXG1JZZqdRdHt5', title: 'real cohort row' },
    ]
    const filtered = excludeSeedDemoCanonicalNewsRows(rows)
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.id).toBe('wUzimisXG1JZZqdRdHt5')
  })

  it('rights-queue route uses the shared constant, not an independent local copy', () => {
    const routeSrc = src('src/app/api/admin/canonical-news/rights-queue/route.ts')
    expect(routeSrc).toContain('SEED_DEMO_CANONICAL_NEWS_IDS')
    expect(routeSrc).toContain('isSeedDemoCanonicalNewsId')
    expect(routeSrc).not.toMatch(/const PILOT_IDS = \[\s*'0ALMkrRCE3LQqubviNZh'/)
  })

  it('batch-filtered queue positively excludes seed/demo rows', () => {
    const routeSrc = src('src/app/api/admin/canonical-news/rights-queue/route.ts')
    expect(routeSrc).toContain('excludedSeedDemoCount')
    expect(routeSrc).toMatch(/cohortRaw\.filter/)
  })

  it('finalize-cohort refuses a batch that contains any seed/demo row', () => {
    const routeSrc = src(
      'src/app/api/admin/canonical-news/rights-queue/finalize-cohort/route.ts'
    )
    expect(routeSrc).toContain('seed_demo_rows_in_batch')
    expect(routeSrc).toContain('isSeedDemoCanonicalNewsId')
  })

  it('rights route pilotHint uses the shared constant', () => {
    const routeSrc = src('src/app/api/admin/canonical-news/[id]/rights/route.ts')
    expect(routeSrc).toContain('isSeedDemoCanonicalNewsId(id)')
  })

  it('never mutates the seed row from any P16.1-added code', () => {
    for (const file of [
      'src/services/editorial/canonicalRightsReviewQueue.ts',
      'src/app/api/admin/canonical-news/rights-queue/route.ts',
    ]) {
      const s = src(file)
      // Documentation may name the seed-target function in prose; it must
      // never be IMPORTED (which is required before it could be called) from
      // any P16.1-added read/isolation code path.
      expect(s).not.toMatch(/import[\s\S]{0,120}seedCandidate2EditorialBlocker/)
      expect(s).not.toMatch(/\.update\(news\)/)
      expect(s).not.toMatch(/\.insert\(news\)/)
      expect(s).not.toMatch(/\.delete\(news\)/)
    }
  })
})

describe('P16.1 Task 8 — A3 defense-in-depth: deliberately NOT implemented', () => {
  it('A3 memory retrieval is unchanged — still relies on canonicalPublishedWhere only', () => {
    const memory = src('src/services/editorial/editorialMemoryRetrieval.ts')
    expect(memory).toContain('canonicalPublishedWhere()')
    // Deliberately does NOT require rightsStatus/editorialBlocker — see report
    // Section 9: a second, independent publish path (editorialSupplyService.ts
    // -> newsMirrorRepository.ts) writes status='published' directly and never
    // populates rightsStatus (column default stays 'PENDING'), so requiring
    // rightsStatus=CLEARED here would silently exclude that legitimately
    // published population, not just add safety margin.
    expect(memory).not.toMatch(/rightsStatus,\s*'CLEARED'/)
  })

  it('confirms the forward mirror-publish path never sets rightsStatus (the reason Task 8 was not applied)', () => {
    const mirror = src('src/services/publisher/newsMirrorRepository.ts')
    expect(mirror).toContain("status: 'published'")
    expect(mirror).not.toContain('rightsStatus')
    expect(mirror).not.toContain('rights_status')
  })
})

describe('P16.1 Task 1 — reuse, not a parallel subsystem', () => {
  it('audit/revoke modules import existing actor-trust and DB helpers rather than redefining them', () => {
    const revoke = src('src/services/editorial/canonicalNewsRevoke.ts')
    expect(revoke).toContain(
      "import { assertTrustedEditorialHumanActor } from '@/services/editorial/newsRightsDecision'"
    )
    expect(revoke).toContain("from '@/db'")
  })

  it('no second AI/embedding/vector dependency introduced anywhere in P16.1 files', () => {
    for (const file of [
      'src/services/editorial/canonicalRightsAudit.ts',
      'src/services/editorial/canonicalNewsRevoke.ts',
      'src/app/api/admin/canonical-news/[id]/revoke/route.ts',
    ]) {
      const s = src(file)
      expect(s.toLowerCase()).not.toMatch(/openai|anthropic|embedding|vector|gpt-|claude-/)
    }
  })
})
