import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAX_PILOT_RECORDS } from '@/services/editorial/canonicalDraftMigrationPilot'
import { canonicalPublishedWhere } from '@/lib/canonical/canonicalEligibility'

describe('P18.4C draft migration safety contracts', () => {
  it('enforces hard max <= 5 with no caller override constant', () => {
    expect(MAX_PILOT_RECORDS).toBe(5)
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/editorial/canonicalDraftMigrationPilot.ts'),
      'utf8'
    )
    expect(src).toContain('MAX_PILOT_RECORDS = 5')
    expect(src).toMatch(/if \(cleaned\.length > hardMax\)/)
    expect(src).not.toMatch(/limit\s*[:=]\s*\d{3,}/)
  })

  it('enforces P18.4E cohort hard max = 10 with P18_4E batch prefix', async () => {
    const { MAX_COHORT_RECORDS, P18_4E_BATCH_PREFIX } = await import(
      '@/services/editorial/canonicalDraftMigrationPilot'
    )
    expect(MAX_COHORT_RECORDS).toBe(10)
    expect(P18_4E_BATCH_PREFIX).toBe('P18_4E_')
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/editorial/canonicalDraftMigrationPilot.ts'),
      'utf8'
    )
    expect(src).toContain('runCanonicalDraftMigrationCohort')
    expect(src).toContain("rightsStatus: 'PENDING'")
    expect(src).toContain("rightsBasis: 'UNKNOWN'")
  })

  it('getNewsBySlug documents draft non-shadowing via published-only canonical path', () => {
    const newsService = readFileSync(
      resolve(process.cwd(), 'src/services/newsService.server.ts'),
      'utf8'
    )
    expect(newsService).toContain('canonicalPublishedWhere')
    expect(newsService).toContain('PG draft does NOT match')
    expect(newsService).toContain('never exposed publicly')
  })

  it('canonicalPublishedWhere excludes draft', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/lib/canonical/canonicalEligibility.ts'),
      'utf8'
    )
    expect(src).toContain("sql`${news.status} NOT IN ('archived', 'draft', 'pending', 'banned')`")
    expect(canonicalPublishedWhere).toBeTypeOf('function')
  })

  it('news-sitemap uses published canonical only', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/app/news-sitemap.xml/route.ts'), 'utf8')
    expect(src).toContain('getCanonicalPublishedNewsForSitemap')
  })

  it('pilot script has no public API route and hard-coded ids', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'scripts/p18_4c_canonical_draft_pilot.mts'),
      'utf8'
    )
    expect(src).toContain('PILOT_FIRESTORE_IDS')
    expect(src).toContain('EXECUTE_P18_4C')
    expect(src).not.toContain('app/api')
  })

  it('migration service inserts status draft only', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/editorial/canonicalDraftMigrationPilot.ts'),
      'utf8'
    )
    expect(src).toMatch(/status:\s*'draft'/)
    expect(src).not.toMatch(/status:\s*'published'/)
  })
})
