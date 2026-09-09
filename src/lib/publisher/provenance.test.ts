import { describe, expect, it } from 'vitest'
import { isPrimaryMembershipRole } from './provenance'
import { assignMembershipRole, MEMBERSHIP_ROLES } from '@/services/crawler/cluster/roles'

describe('isPrimaryMembershipRole', () => {
  it('CASE 1 — PRIMARY passes', () => {
    expect(isPrimaryMembershipRole('PRIMARY')).toBe(true)
  })

  it('CASE 2 — SUPPORTING must not pass', () => {
    expect(isPrimaryMembershipRole('SUPPORTING')).toBe(false)
  })

  it('CASE 3 — DUPLICATE must not pass', () => {
    expect(isPrimaryMembershipRole('DUPLICATE')).toBe(false)
  })

  it('CASE 4 — LOW_QUALITY must not pass', () => {
    expect(isPrimaryMembershipRole('LOW_QUALITY')).toBe(false)
  })

  it('MATERIAL_UPDATE must not pass (it is not PRIMARY, see roles.ts)', () => {
    expect(isPrimaryMembershipRole('MATERIAL_UPDATE')).toBe(false)
  })

  it('null/undefined/unknown role must not pass — absence of role data is not evidence of origination', () => {
    expect(isPrimaryMembershipRole(null)).toBe(false)
    expect(isPrimaryMembershipRole(undefined)).toBe(false)
    expect(isPrimaryMembershipRole('something-unexpected')).toBe(false)
  })

  it('every non-PRIMARY role in the real MEMBERSHIP_ROLES vocabulary is rejected', () => {
    const nonPrimary = MEMBERSHIP_ROLES.filter((r) => r !== 'PRIMARY')
    expect(nonPrimary.length).toBeGreaterThan(0)
    for (const role of nonPrimary) {
      expect(isPrimaryMembershipRole(role)).toBe(false)
    }
  })
})

describe('MATERIAL_UPDATE is never assigned as PRIMARY (roles.ts ground truth)', () => {
  it('assignMembershipRole never returns MATERIAL_UPDATE for a primary article', () => {
    // isPrimary short-circuits to PRIMARY before isMaterialUpdate is even
    // considered — confirms LP7R.1's Task 4 requirement not to equate
    // MATERIAL_UPDATE with PRIMARY for publisher attribution.
    const role = assignMembershipRole({
      isPrimary: true,
      isExactDuplicate: false,
      qualityStatus: 'OK',
      isMaterialUpdate: true,
    })
    expect(role).toBe('PRIMARY')
  })

  it('a non-primary material-update article is classified MATERIAL_UPDATE, not PRIMARY', () => {
    const role = assignMembershipRole({
      isPrimary: false,
      isExactDuplicate: false,
      qualityStatus: 'OK',
      isMaterialUpdate: true,
    })
    expect(role).toBe('MATERIAL_UPDATE')
    expect(isPrimaryMembershipRole(role)).toBe(false)
  })
})
