import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizePendingRightsSubmission } from '@/services/editorial/newsRightsDecision'

describe('P18.4E.3A pending rights consistency', () => {
  it('PENDING + non-UNKNOWN normalizes to PENDING/UNKNOWN and clears decision metadata', () => {
    const n = normalizePendingRightsSubmission({
      status: 'PENDING',
      basis: 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
    })
    expect(n).toEqual({
      status: 'PENDING',
      basis: 'UNKNOWN',
      clearsDecisionMetadata: true,
    })
  })

  it('CLEARED keeps submitted non-UNKNOWN basis', () => {
    const n = normalizePendingRightsSubmission({
      status: 'CLEARED',
      basis: 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION',
    })
    expect(n.basis).toBe('EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION')
    expect(n.clearsDecisionMetadata).toBe(false)
  })

  it('REWRITE_REQUIRED and DO_NOT_PUBLISH do not force UNKNOWN', () => {
    expect(
      normalizePendingRightsSubmission({
        status: 'REWRITE_REQUIRED',
        basis: 'SOURCE_ASSOCIATED',
      }).basis
    ).toBe('SOURCE_ASSOCIATED')
    expect(
      normalizePendingRightsSubmission({
        status: 'DO_NOT_PUBLISH',
        basis: 'HUMAN_REVIEWED_OTHER',
      }).basis
    ).toBe('HUMAN_REVIEWED_OTHER')
  })

  it('recordNewsRightsDecision enforces PENDING→UNKNOWN and null decision fields', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/services/editorial/newsRightsDecision.ts'),
      'utf8'
    )
    expect(src).toContain("input.status === 'PENDING' ? 'UNKNOWN' : input.basis")
    expect(src).toContain("input.status === 'PENDING' ? null : input.actorUid.trim()")
    expect(src).toContain("input.status === 'PENDING' ? null : now")
    expect(src).toContain('repairPendingRightsConsistency')
  })

  it('CMS UI forces UNKNOWN when PENDING and protects save lifecycle', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/app/admin/canonical-drafts/rights/page.tsx'),
      'utf8'
    )
    expect(page).toContain("if (next === 'PENDING') setBasis('UNKNOWN')")
    expect(page).toContain("disabled={status === 'PENDING'}")
    expect(page).toContain("effectiveBasis = effectiveStatus === 'PENDING' ? 'UNKNOWN' : basis")
    expect(page).toContain('saveInFlight')
    expect(page).toContain('if (saveInFlight.current || saving) return')
    expect(page).toContain('finally')
    expect(page).toContain('setSaving(false)')
    expect(page).not.toMatch(/actorUid:\s*[^a]/)
  })

  it('rights POST still never publishes and ignores client actor', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'src/app/api/admin/canonical-news/[id]/rights/route.ts'),
      'utf8'
    )
    expect(route).toContain('actorUid: auth.uid')
    expect(route).toContain('published: false')
    expect(route).toContain('void body.actorUid')
  })
})
