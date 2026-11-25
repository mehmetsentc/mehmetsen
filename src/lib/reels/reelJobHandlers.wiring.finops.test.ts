import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Static check (no render modules loaded): every `remote: { handler: '…' }` a route or
// service queues for the Railway worker must exist in the handler registry, and the
// same handler must be what the local `run` calls — so Vercel and Railway do the same work.
const root = process.cwd()
const registry = readFileSync(join(root, 'src/lib/reels/reelJobHandlers.ts'), 'utf8')
const names = new Set([...registry.matchAll(/^  '([a-zA-Z.]+)': async/gm)].map((m) => m[1]))

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts') && !p.includes('.test.')) out.push(p)
  }
  return out
}

describe('FinOps reel worker wiring', () => {
  const files = walk(join(root, 'src')).filter((p) => readFileSync(p, 'utf8').includes('remote: { handler:'))
  it('finds the queued call sites', () => {
    expect(names.size).toBe(10)
    expect(files.length).toBeGreaterThanOrEqual(8)
  })
  for (const p of files) {
    it(`${p.slice(root.length + 1)} uses registered handlers`, () => {
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/remote: \{ handler: '([a-zA-Z.]+)'/g)) expect(names, m[1]).toContain(m[1])
    })
  }
  it('the worker image runs the build-time smoke check', () => {
    const docker = readFileSync(join(root, 'scripts/worker/Dockerfile.reels'), 'utf8')
    expect(docker).toMatch(/reel-worker\.ts --check/)
  })
})
