import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs module without types
import { MAX_HOTFIX_DEPLOYS_PER_DAY, hasDeployTag, isHotfix, isUrgentHotfix } from '../../../scripts/lib/deploy-gate.mjs'

const gate = readFileSync('scripts/vercel-ignored-build.mjs', 'utf8')

describe('FinOps 21 Nov: [hotfix] daily cap, [hotfix-urgent] escape', () => {
  it('tags are told apart', () => {
    expect(isHotfix('fix: x [hotfix]')).toBe(true)
    expect(isHotfix('fix: x [hotfix-urgent]')).toBe(false)
    expect(isUrgentHotfix('fix: x [hotfix-urgent]')).toBe(true)
    expect(isUrgentHotfix('fix: x [hotfix]')).toBe(false)
    expect(hasDeployTag('fix: x [hotfix-urgent]')).toBe(true)
  })

  it('default cap is 6 production deploys per 24h', () => {
    expect(MAX_HOTFIX_DEPLOYS_PER_DAY).toBe(6)
  })

  it('urgent and FORCE_DEPLOY build before any cap; hotfix is counted', () => {
    const force = gate.indexOf("proceed('FORCE_DEPLOY env')")
    const urgent = gate.indexOf("proceed('[hotfix-urgent] (production is down)')")
    const hotfix = gate.indexOf('if (isHotfix(message))')
    expect(force).toBeGreaterThan(-1)
    expect(urgent).toBeGreaterThan(force)
    expect(hotfix).toBeGreaterThan(urgent)
    const block = gate.slice(hotfix, gate.indexOf('if (isForceDeploy(message))'))
    expect(block).toContain('recent.count < MAX_HOTFIX_DEPLOYS_PER_DAY')
    expect(block).toContain('[hotfix-urgent]')
  })

  it('gate errors still build (never a false cancel)', () => {
    expect(gate).toContain("proceeding to avoid false cancels")
  })
})
