import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs module without types
import { isPreviewRequested } from '../../../scripts/lib/deploy-gate.mjs'

const gate = readFileSync('scripts/vercel-ignored-build.mjs', 'utf8')
const lib = readFileSync('scripts/lib/deploy-gate.mjs', 'utf8')

describe('FinOps 25 Nov: previews only on request, counting without an API token', () => {
  it('[preview] tag is recognised', () => {
    expect(isPreviewRequested('feat: x [preview]')).toBe(true)
    expect(isPreviewRequested('feat: x [hotfix-urgent]')).toBe(false)
  })

  it('preview skip runs after FORCE_DEPLOY and before every production rule', () => {
    const force = gate.indexOf("proceed('FORCE_DEPLOY env')")
    const preview = gate.indexOf("env === 'preview' && !isPreviewRequested(message)")
    const urgent = gate.indexOf('if (isUrgentHotfix(message))')
    expect(force).toBeGreaterThan(-1)
    expect(preview).toBeGreaterThan(force)
    expect(urgent).toBeGreaterThan(preview)
  })

  it('git fallback deepens a shallow clone, best effort with a timeout', () => {
    expect(lib).toContain('git rev-parse --is-shallow-repository')
    expect(lib).toContain('--deepen=60')
    expect(lib).toContain('timeout: 20_000')
  })
})
