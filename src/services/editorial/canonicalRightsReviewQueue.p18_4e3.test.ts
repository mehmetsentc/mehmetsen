import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  P18_4E_COHORT1_BATCH_ID,
  aggregateBatchRightsProgress,
  sortRightsReviewQueueByRisk,
  riskSortRank,
  isHumanEditorialBlocker,
} from '@/services/editorial/canonicalRightsReviewQueue'

describe('P18.4E.3 rights review UX helpers', () => {
  it('uses exact Cohort #1 batch id', () => {
    expect(P18_4E_COHORT1_BATCH_ID).toBe('P18_4E_20260904T172223Z')
  })

  it('ranks MEDIUM before HIGH', () => {
    expect(riskSortRank('MEDIUM_OVERLAP')).toBeLessThan(riskSortRank('HIGH_SOURCE_OVERLAP'))
  })

  it('sorts MEDIUM first then HIGH ascending by final score', () => {
    const ordered = sortRightsReviewQueueByRisk([
      { id: 'high-b', risk: 'HIGH_SOURCE_OVERLAP', finalWeightedScore: 0.9 },
      { id: '1Z22cs0LfMcvrwwgaSTn', risk: 'MEDIUM_OVERLAP', finalWeightedScore: 0.656 },
      { id: 'high-a', risk: 'HIGH_SOURCE_OVERLAP', finalWeightedScore: 0.771 },
      { id: 'wUzimisXG1JZZqdRdHt5', risk: 'MEDIUM_OVERLAP', finalWeightedScore: 0.549 },
    ])
    expect(ordered[0]).toBe('wUzimisXG1JZZqdRdHt5')
    expect(ordered[1]).toBe('1Z22cs0LfMcvrwwgaSTn')
    expect(ordered[2]).toBe('high-a')
    expect(ordered[3]).toBe('high-b')
  })

  it('aggregates batch rights progress read-only', () => {
    const p = aggregateBatchRightsProgress([
      { status: 'draft', rightsStatus: 'PENDING' },
      { status: 'draft', rightsStatus: 'PENDING' },
      { status: 'draft', rightsStatus: 'CLEARED' },
      { status: 'draft', rightsStatus: 'REWRITE_REQUIRED' },
      { status: 'draft', rightsStatus: 'DO_NOT_PUBLISH' },
      { status: 'published', rightsStatus: 'CLEARED' },
    ])
    expect(p).toEqual({
      total: 6,
      pending: 2,
      cleared: 2,
      rewriteRequired: 1,
      doNotPublish: 1,
      published: 1,
    })
  })

  it('allows only existing human blocker vocabulary', () => {
    expect(isHumanEditorialBlocker('HIGH_SOURCE_OVERLAP')).toBe(true)
    expect(isHumanEditorialBlocker('AUTO_FROM_SIMILARITY')).toBe(false)
  })

  it('CMS page has batch filter, risk sort, confirms, and defers cohort publish', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/app/admin/canonical-drafts/rights/page.tsx'),
      'utf8'
    )
    expect(page).toContain('P18_4E_COHORT1_BATCH_ID')
    expect(page).toContain('sortRightsReviewQueueByRisk')
    expect(page).toContain('Similarity evidence is NOT copyright clearance')
    expect(page).toContain('HIGH similarity uyarısı')
    expect(page).toContain('DO_NOT_PUBLISH onayı')
    expect(page).toContain('deferPublish')
    expect(page).toContain('Cohort publish deferred')
    expect(page).toContain('HIGH_SOURCE_OVERLAP')
    expect(page).not.toMatch(/actorUid:\s*/)
  })

  it('rights POST ignores client actor and never publishes', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'src/app/api/admin/canonical-news/[id]/rights/route.ts'),
      'utf8'
    )
    expect(route).toContain('actorUid: auth.uid')
    expect(route).toContain('clientActorIgnored: true')
    expect(route).toContain('published: false')
    expect(route).toContain('executePublish: false')
    expect(route).toContain('void body.actorUid')
  })

  it('rights-queue supports exact batch filter', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'src/app/api/admin/canonical-news/rights-queue/route.ts'),
      'utf8'
    )
    expect(route).toContain("searchParams.get('batch')")
    expect(route).toContain('aggregateBatchRightsProgress')
    expect(route).toContain('P18_4E_COHORT1_BATCH_ID')
  })

  it('recordNewsRightsDecision can set human blocker only on REWRITE_REQUIRED', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/editorial/newsRightsDecision.ts'),
      'utf8'
    )
    expect(src).toContain("input.status === 'REWRITE_REQUIRED'")
    expect(src).toContain('HIGH_SOURCE_OVERLAP')
    expect(src).toContain('editorial_blocker_not_allowed')
    expect(src).not.toMatch(/DeepSeek|OpenAI|openai/)
  })
})
