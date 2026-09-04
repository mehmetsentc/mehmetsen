import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluateCanonicalPublishEligibility } from '@/services/editorial/canonicalNewsPublish'
import { evaluateCanonicalDraftPublishGate } from '@/services/editorial/newsRightsDecision'

const BODY = 'y'.repeat(200)
const BASE = {
  status: 'draft',
  publicationAuthority: 'HUMAN_EDITOR',
  rightsStatus: 'CLEARED',
  rightsBasis: 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
  rightsDecidedBy: 'trusted_human_uid_exact',
  rightsDecidedAt: '2026-09-04T09:28:09.084Z',
  editorialBlocker: null as string | null,
  slug: 'ok-slug',
  title: 'Ok title',
  content: BODY,
  source: 'cumhuriyet',
  sourceUrl: 'https://www.cumhuriyet.com.tr/a',
}

describe('P18.4D.8 canonical publish eligibility', () => {
  it('C1-shaped valid draft → publishable', () => {
    const g = evaluateCanonicalPublishEligibility(BASE)
    expect(g.publishable).toBe(true)
    expect(g.blockers).toEqual([])
    expect(g.executePublish).toBe(false)
  })

  it('PENDING rights → reject', () => {
    const g = evaluateCanonicalPublishEligibility({ ...BASE, rightsStatus: 'PENDING' })
    expect(g.publishable).toBe(false)
    expect(g.blockers).toContain('rights_pending')
  })

  it('UNKNOWN basis → reject', () => {
    const g = evaluateCanonicalPublishEligibility({ ...BASE, rightsBasis: 'UNKNOWN' })
    expect(g.publishable).toBe(false)
    expect(g.blockers).toContain('rights_basis_missing')
  })

  it('REWRITE_REQUIRED → reject', () => {
    const g = evaluateCanonicalPublishEligibility({
      ...BASE,
      rightsStatus: 'REWRITE_REQUIRED',
      rightsBasis: 'UNKNOWN',
    })
    expect(g.blockers).toContain('rights_rewrite_required')
    expect(g.publishable).toBe(false)
  })

  it('DO_NOT_PUBLISH → reject', () => {
    const g = evaluateCanonicalPublishEligibility({
      ...BASE,
      rightsStatus: 'DO_NOT_PUBLISH',
      rightsBasis: 'HUMAN_REVIEWED_OTHER',
    })
    expect(g.blockers).toContain('rights_do_not_publish')
  })

  it('editorial blocker → reject even if CLEARED', () => {
    const g = evaluateCanonicalPublishEligibility({
      ...BASE,
      editorialBlocker: 'HIGH_SOURCE_OVERLAP',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers.some((b) => b.startsWith('editorial_blocker:'))).toBe(true)
  })

  it('missing rights actor → reject', () => {
    const g = evaluateCanonicalPublishEligibility({ ...BASE, rightsDecidedBy: null })
    expect(g.blockers).toContain('rights_decided_by_missing')
    expect(g.publishable).toBe(false)
  })

  it('missing rights timestamp → reject', () => {
    const g = evaluateCanonicalPublishEligibility({ ...BASE, rightsDecidedAt: null })
    expect(g.blockers).toContain('rights_decided_at_missing')
    expect(g.publishable).toBe(false)
  })

  it('non-HUMAN_EDITOR authority → reject', () => {
    const g = evaluateCanonicalPublishEligibility({
      ...BASE,
      publicationAuthority: 'LEGACY',
    })
    expect(g.blockers.some((b) => b.startsWith('publication_authority_not_human_editor'))).toBe(
      true
    )
  })

  it('C2-shaped bypass impossible', () => {
    const g = evaluateCanonicalPublishEligibility({
      ...BASE,
      rightsStatus: 'REWRITE_REQUIRED',
      rightsBasis: 'UNKNOWN',
      rightsDecidedBy: null,
      rightsDecidedAt: null,
      editorialBlocker: 'HIGH_SOURCE_OVERLAP',
      source: 'bogazgazetesi-com-tr',
      slug: 'canakkalede-tarihe-saygi-ani-dalisi-ve-yelken-surusu-deneyimi',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers).toContain('rights_rewrite_required')
    expect(g.blockers.some((b) => b.includes('HIGH_SOURCE_OVERLAP'))).toBe(true)
  })

  it('C3-shaped PENDING bypass impossible', () => {
    const g = evaluateCanonicalPublishEligibility({
      ...BASE,
      rightsStatus: 'PENDING',
      rightsBasis: 'UNKNOWN',
      rightsDecidedBy: null,
      rightsDecidedAt: null,
      source: 'dunya',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers).toContain('rights_pending')
  })

  it('rights clear gate still does not auto-execute publish', () => {
    const rightsGate = evaluateCanonicalDraftPublishGate(BASE)
    expect(rightsGate.publishable).toBe(true)
    expect(rightsGate.executePublish).toBe(false)
    const pubGate = evaluateCanonicalPublishEligibility(BASE)
    expect(pubGate.executePublish).toBe(false)
  })

  it('already-published status not treated as publishable draft', () => {
    const g = evaluateCanonicalPublishEligibility({ ...BASE, status: 'published' })
    expect(g.publishable).toBe(false)
    expect(g.blockers.some((b) => b.startsWith('status_not_draft'))).toBe(true)
  })
})

describe('P18.4D.8 publish API / UI source guards', () => {
  it('publish route uses news:publish and auth.uid only', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/admin/canonical-news/[id]/publish/route.ts'),
      'utf8'
    )
    expect(src).toContain("verifyCmsToken(request, 'news:publish')")
    expect(src).toContain('actorUid: auth.uid')
    expect(src).toContain('client_override_rejected')
    expect(src).toContain('publishCanonicalNews')
    expect(src).not.toMatch(/actorUid:\s*body/)
  })

  it('service uses conditional draft→published update', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/editorial/canonicalNewsPublish.ts'),
      'utf8'
    )
    expect(src).toContain("status: 'published'")
    expect(src).toContain("eq(news.status, 'draft')")
    expect(src).toContain('alreadyPublished')
    expect(src).toContain('assertTrustedEditorialHumanActor')
    expect(src).toContain('content_mutated_on_publish')
    expect(src).toContain('legacy_id_mutated')
  })

  it('rights route still never auto-publishes', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/api/admin/canonical-news/[id]/rights/route.ts'),
      'utf8'
    )
    expect(src).toContain('executePublish: false')
    expect(src).toContain('published: false')
    expect(src).not.toMatch(/status:\s*'published'/)
  })

  it('CMS UI exposes Yayınla only via publishEligible path', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/app/admin/canonical-drafts/rights/page.tsx'),
      'utf8'
    )
    expect(src).toContain('/publish')
    expect(src).toContain('Yayınla')
    expect(src).toContain('publishEligible')
    expect(src).toContain('window.confirm')
  })
})
