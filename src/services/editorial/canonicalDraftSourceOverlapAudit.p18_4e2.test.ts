import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  checkTextSimilarity,
  computeMaxSharedContiguousTokenRun,
  classifyOverlapCategoryFromWeightedScore,
  explainOverlapClassificationFromWeightedScore,
  tokenize,
} from '@/services/editorial/editorialSimilarityGate'
import { classifyOverlapFromTexts } from '@/services/editorial/canonicalDraftSourceOverlapAudit'
import { evaluateCanonicalDraftPublishGate } from '@/services/editorial/newsRightsDecision'

describe('P18.4E.2 / P18.4E.2A source-overlap audit contracts', () => {
  it('classifies identical text as HIGH_SOURCE_OVERLAP (review map of HIGH_OVERLAP)', () => {
    const text =
      'Türkiye Cumhuriyet Merkez Bankası Para Politikası Kurulu politika faizini yüzde 50 seviyesinde sabit tuttu ve karar metninde enflasyon görünümünü vurguladı.'
    const r = classifyOverlapFromTexts(text, text)
    expect(r.gateOverlapCategory).toBe('HIGH_OVERLAP')
    expect(r.risk).toBe('HIGH_SOURCE_OVERLAP')
    expect(r.clearanceImplied).toBe(false)
    expect(r.aiInvolved).toBe(false)
    expect(r.maxSharedContiguousRun).toBeGreaterThan(5)
    expect(r.classificationReason).toMatch(/threshold>=0\.700 → HIGH/)
  })

  it('classifies distinct text as LOW_OVERLAP without implying clearance', () => {
    const a = 'Meteoroloji Genel Müdürlüğü Marmara ve Ege için fırtına uyarısında bulundu.'
    const b = 'Borsa İstanbul günü yüzde iki virgül beş yükselişle rekor seviyede tamamladı.'
    const r = classifyOverlapFromTexts(a, b)
    expect(r.risk).toBe('LOW_OVERLAP')
    expect(r.clearanceImplied).toBe(false)
  })

  it('classifies partial rewrite as MEDIUM_OVERLAP', () => {
    const a =
      'İstanbul Cumhuriyet Başsavcılığı tarafından yürütülen soruşturma kapsamında firari şüpheli teslim oldu ve jandarma ekiplerince gözaltına alındı.'
    const b =
      'Başsavcılık tarafından yürütülen soruşturma çerçevesinde aranan firari şüpheli polise teslim oldu ve adli işlemler için gözaltına alındı.'
    const r = classifyOverlapFromTexts(a, b)
    expect(r.risk).toBe('MEDIUM_OVERLAP')
  })

  it('computes max shared contiguous token run as evidence only', () => {
    const a = tokenize('alfa beta gamma delta epsilon')
    const b = tokenize('omega beta gamma delta zeta')
    expect(computeMaxSharedContiguousTokenRun(a, b)).toBe(3)
  })

  it('weighted formula matches Jaccard×0.4 + ngram×0.3 + tokenMatch×0.3', () => {
    const textA =
      'İstanbul Cumhuriyet Başsavcılığı tarafından yürütülen soruşturma kapsamında firari şüpheli teslim oldu ve jandarma ekiplerince gözaltına alındı.'
    const textB =
      'Başsavcılık tarafından yürütülen soruşturma çerçevesinde aranan firari şüpheli polise teslim oldu ve adli işlemler için gözaltına alındı.'
    const sim = checkTextSimilarity(textA, textB)
    const recomputed = sim.jaccard * 0.4 + sim.ngram3 * 0.3 + sim.tokenMatchRatio * 0.3
    expect(sim.similarity).toBeCloseTo(recomputed, 12)
    expect(sim.overlapCategory).toBe(classifyOverlapCategoryFromWeightedScore(sim.similarity))
  })

  it('threshold boundaries: 0.299 LOW, 0.300 MEDIUM, 0.699 MEDIUM, 0.700 HIGH', () => {
    expect(classifyOverlapCategoryFromWeightedScore(0.299)).toBe('LOW_OVERLAP')
    expect(classifyOverlapCategoryFromWeightedScore(0.3)).toBe('MEDIUM_OVERLAP')
    expect(classifyOverlapCategoryFromWeightedScore(0.699)).toBe('MEDIUM_OVERLAP')
    expect(classifyOverlapCategoryFromWeightedScore(0.7)).toBe('HIGH_OVERLAP')
    expect(explainOverlapClassificationFromWeightedScore(0.734)).toBe(
      'finalWeightedScore=0.734 threshold>=0.700 → HIGH'
    )
  })

  it('UI label derives from final classifier not n-gram alone', () => {
    // 0.471 n-gram-like alone would be MEDIUM; classification is on weighted final only.
    expect(classifyOverlapCategoryFromWeightedScore(0.471)).toBe('MEDIUM_OVERLAP')
    expect(classifyOverlapCategoryFromWeightedScore(0.771)).toBe('HIGH_OVERLAP')
  })

  it('empty source comparison stays unevaluable at audit wrapper level via checkTextSimilarity zeros', () => {
    const sim = checkTextSimilarity('enough body text here for tokens', '')
    expect(sim.maxSharedContiguousRun).toBe(0)
    expect(sim.similarity).toBe(0)
  })

  it('PENDING remains not publishable regardless of overlap', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'PENDING',
      rightsBasis: 'UNKNOWN',
      editorialBlocker: null,
      slug: 'x',
      title: 't',
      content: 'c'.repeat(200),
      sourceUrl: 'https://example.com/a',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers).toContain('rights_pending')
    expect(g.executePublish).toBe(false)
  })

  it('C2-style blocker remains non-clearable / non-publishable', () => {
    const g = evaluateCanonicalDraftPublishGate({
      status: 'draft',
      rightsStatus: 'REWRITE_REQUIRED',
      rightsBasis: 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
      editorialBlocker: 'HIGH_SOURCE_OVERLAP',
      slug: 'x',
      title: 't',
      content: 'c'.repeat(200),
      sourceUrl: 'https://example.com/a',
    })
    expect(g.publishable).toBe(false)
    expect(g.blockers.some((b) => b.includes('HIGH_SOURCE_OVERLAP'))).toBe(true)
  })

  it('audit service and API never auto-mutate rights or publish', () => {
    const auditSrc = readFileSync(
      resolve(process.cwd(), 'src/services/editorial/canonicalDraftSourceOverlapAudit.ts'),
      'utf8'
    )
    const apiSrc = readFileSync(
      resolve(process.cwd(), 'src/app/api/admin/canonical-news/[id]/source-overlap/route.ts'),
      'utf8'
    )
    expect(auditSrc).toContain('NEVER mutates')
    expect(auditSrc).not.toMatch(/rightsStatus:\s*'CLEARED'/)
    expect(auditSrc).not.toMatch(/\.update\(/)
    expect(apiSrc).toContain('rightsMutated: false')
    expect(apiSrc).toContain('published: false')
    expect(apiSrc).not.toMatch(/recordNewsRightsDecision|publishCanonicalNews/)
  })

  it('CMS page surfaces final score + components and separates blocker', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/app/admin/canonical-drafts/rights/page.tsx'),
      'utf8'
    )
    expect(page).toContain('source-overlap')
    expect(page).toContain('Final weighted score')
    expect(page).toContain('Jaccard (component)')
    expect(page).toContain('3-gram overlap (component)')
    expect(page).toContain('Token match (component)')
    expect(page).toContain('DB editorial blocker')
    expect(page).toContain('Similarity risk')
    expect(page).toContain('EVIDENCE_ONLY')
    expect(page).toContain('risk≠blocker')
  })
})
