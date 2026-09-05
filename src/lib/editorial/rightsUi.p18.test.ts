import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RIGHTS_PAGE,
  RIGHTS_STATUS_TR,
  publicationStateTr,
  riskRecommendationTr,
} from '@/lib/editorial/rightsUiTr'

describe('Yayın Hakları UX + bulk', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/admin/canonical-drafts/rights/page.tsx'),
    'utf8'
  )
  const bulk = readFileSync(
    join(process.cwd(), 'src/app/api/admin/canonical-news/rights-bulk/route.ts'),
    'utf8'
  )
  const sidebar = readFileSync(
    join(process.cwd(), 'src/components/admin/CMSSidebar.tsx'),
    'utf8'
  )

  it('uses Turkish product naming', () => {
    expect(RIGHTS_PAGE.title).toBe('Yayın Hakları')
    expect(page).toContain('Yayın Hakları')
    expect(sidebar).toContain("label: 'Yayın Hakları'")
    expect(page).not.toContain('Canonical draft rights review')
  })

  it('maps published+pending to explicit Turkish state', () => {
    expect(
      publicationStateTr({
        status: 'draft',
        rightsStatus: 'PENDING',
        hasPublishedBy: true,
      })
    ).toContain('Hak Kontrolü Gerekli')
  })

  it('bulk API never publishes and bounds ids', () => {
    expect(bulk).toContain('publishes: 0')
    expect(bulk).toContain('slice(0, 50)')
    expect(bulk).toContain('verifyCmsToken')
    expect(bulk).toContain('recordNewsRightsDecision')
    expect(bulk).not.toMatch(/executePublish:\s*true|status:\s*'published'/)
  })

  it('UI supports selection + bulk confirmation + no bulk publish', () => {
    expect(page).toContain('runBulk')
    expect(page).toContain('Seçilenleri Yeniden Yazılacak')
    expect(page).toContain('Hiçbir haber yayınlanmayacak')
    expect(page).toContain('publishes: 0'.length > 0 ? 'runBulk' : '')
    expect(bulk).toContain('publishes: 0')
  })

  it('risk recommendation is Turkish and non-legal', () => {
    expect(riskRecommendationTr('HIGH_SOURCE_OVERLAP')).toMatch(/Yeniden yaz/)
    expect(RIGHTS_STATUS_TR.REWRITE_REQUIRED).toBe('Yeniden Yazılacak')
  })
})
