import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COST_FREEZE_ENABLED, COST_FREEZE_MESSAGE } from '@/lib/costFreeze'

describe('FINOPS cost freeze', () => {
  it('is compiled on', () => {
    expect(COST_FREEZE_ENABLED).toBe(true)
    expect(COST_FREEZE_MESSAGE).toContain('bakım')
  })

  it('middleware intercepts pages and APIs before tenant/DB, except health', () => {
    const mw = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
    expect(mw).toContain('COST_FREEZE_ENABLED')
    expect(mw).toContain("status: 503")
    expect(mw).toContain('api/health')
    expect(mw).toMatch(/matcher:\s*\[/)
    expect(mw).not.toContain('(?!api|_next/static')
    const freezeBlock = mw.slice(mw.indexOf('if (COST_FREEZE_ENABLED)'), mw.indexOf('const { pathname } = request.nextUrl', mw.indexOf('if (COST_FREEZE_ENABLED)') + 10))
    expect(freezeBlock).not.toContain('resolveTenantFromRequest')
    expect(freezeBlock).not.toContain('verifyCmsSessionToken')
  })

  it('vercel cron schedules are empty; cron route files remain', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: unknown[] }
    expect(vercel.crons).toEqual([])
    const tick = readFileSync(join(process.cwd(), 'src/app/api/cron/crawler/tick/route.ts'), 'utf8')
    expect(tick).toContain('runCrawlerTick')
  })

  it('health stays DB-free and reports freeze', () => {
    const health = readFileSync(join(process.cwd(), 'src/app/api/health/route.ts'), 'utf8')
    expect(health).toContain("runtime = 'edge'")
    expect(health).toContain('COST_FREEZE_ENABLED')
    expect(health).not.toContain('getDb')
    expect(health).not.toContain('getAdminFirestore')
  })
})
