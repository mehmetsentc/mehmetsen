import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluateCanonicalDraftPublishGate } from '@/services/editorial/newsRightsDecision'

describe('P18.4E.4 cohort finalize contracts', () => {
  it('REWRITE_REQUIRED is non-publishable', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'REWRITE_REQUIRED',
      rightsBasis: 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
      editorialBlocker: null,
      slug: 'x',
      title: 't',
      content: 'c'.repeat(200),
      sourceUrl: 'https://example.com',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers).toContain('rights_rewrite_required')
  })

  it('HIGH blocker remains non-publishable', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'REWRITE_REQUIRED',
      rightsBasis: 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
      editorialBlocker: 'HIGH_SOURCE_OVERLAP',
      slug: 'x',
      title: 't',
      content: 'c'.repeat(200),
      sourceUrl: 'https://example.com',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers.some((b) => b.includes('HIGH_SOURCE_OVERLAP'))).toBe(true)
  })

  it('finalize-cohort route uses session actor and never publishes', () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        'src/app/api/admin/canonical-news/rights-queue/finalize-cohort/route.ts'
      ),
      'utf8'
    )
    expect(src).toContain('verifyCmsToken')
    expect(src).toContain('actorUid: auth.uid')
    expect(src).toContain('void body?.actorUid')
    expect(src).toContain("status: 'REWRITE_REQUIRED'")
    expect(src).toContain('HIGH_SOURCE_OVERLAP')
    expect(src).toContain('published: false')
    expect(src).toContain('executePublish: false')
    expect(src).toContain('aiCalls: 0')
    expect(src).not.toMatch(/publishCanonicalNews|DeepSeek|OpenAI/)
  })

  it('CMS page has one-click finalize and collapsible technical details', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/app/admin/canonical-drafts/rights/page.tsx'),
      'utf8'
    )
    expect(page).toContain('finalize-cohort')
    expect(page).toContain('REWRITE_REQUIRED_COHORT_1')
    expect(page).toContain('Teknik detayları göster')
    expect(page).toContain('SOURCE SIMILARITY')
    expect(page).toContain('Finalize Cohort #1')
  })
})
