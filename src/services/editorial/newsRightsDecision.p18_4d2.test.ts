import { describe, expect, it } from 'vitest'
import {
  evaluateCanonicalDraftPublishGate,
  isNewsRightsBasis,
  isNewsRightsStatus,
} from '@/services/editorial/newsRightsDecision'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('P18.4D.2 news rights decision foundation', () => {
  it('recognizes rights vocab', () => {
    expect(isNewsRightsStatus('CLEARED')).toBe(true)
    expect(isNewsRightsStatus('REWRITE_REQUIRED')).toBe(true)
    expect(isNewsRightsStatus('DO_NOT_PUBLISH')).toBe(true)
    expect(isNewsRightsStatus('BOGUS')).toBe(false)
    expect(isNewsRightsBasis('EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION')).toBe(true)
    expect(isNewsRightsBasis('LICENSED')).toBe(true)
  })

  it('pending rights blocks publish', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'PENDING',
      rightsBasis: 'UNKNOWN',
      slug: 'x',
      title: 't',
      content: 'y'.repeat(200),
      sourceUrl: 'https://example.com',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers).toContain('rights_pending')
    expect(g.executePublish).toBe(false)
  })

  it('cleared without basis blocks publish', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'CLEARED',
      rightsBasis: 'UNKNOWN',
      slug: 'x',
      title: 't',
      content: 'y'.repeat(200),
      sourceUrl: 'https://example.com',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers).toContain('rights_basis_missing')
  })

  it('rewrite-required blocks publish', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'REWRITE_REQUIRED',
      rightsBasis: 'UNKNOWN',
      slug: 'x',
      title: 't',
      content: 'y'.repeat(200),
      sourceUrl: 'https://example.com',
    })
    expect(g.blockers).toContain('rights_rewrite_required')
    expect(g.publishable).toBe(false)
  })

  it('do-not-publish blocks publish', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'DO_NOT_PUBLISH',
      rightsBasis: 'HUMAN_REVIEWED_OTHER',
      slug: 'x',
      title: 't',
      content: 'y'.repeat(200),
      sourceUrl: 'https://example.com',
    })
    expect(g.blockers).toContain('rights_do_not_publish')
  })

  it('editorial blocker cannot be bypassed by CLEARED', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'CLEARED',
      rightsBasis: 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
      editorialBlocker: 'HIGH_SOURCE_OVERLAP',
      slug: 'x',
      title: 't',
      content: 'y'.repeat(200),
      sourceUrl: 'https://example.com',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers.some((b) => b.startsWith('editorial_blocker:'))).toBe(true)
  })

  it('acceptable rights still returns executePublish false', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'CLEARED',
      rightsBasis: 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
      slug: 'ok-slug',
      title: 'Ok',
      content: 'y'.repeat(200),
      sourceUrl: 'https://example.com/a',
    })
    expect(g.publishable).toBe(true)
    expect(g.executePublish).toBe(false)
  })

  it('API route does not auto-publish', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/admin/canonical-news/[id]/rights/route.ts'),
      'utf8'
    )
    expect(src).toContain('executePublish: false')
    expect(src).toContain('published: false')
    expect(src).not.toMatch(/status:\s*'published'/)
  })

  it('migration is additive DDL only', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/db/migrations/0040_phase_p18_4d2_news_rights_decision.sql'),
      'utf8'
    )
    expect(src).toContain('rights_status')
    expect(src).toContain('editorial_blocker')
    expect(src.toUpperCase()).not.toContain('DROP TABLE')
    expect(src.toUpperCase()).not.toContain('DELETE FROM')
  })
})
