import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COST_FREEZE_ENABLED, COST_FREEZE_MESSAGE } from '@/lib/costFreeze'

describe('FINOPS cost freeze', () => {
  it('is compiled on after the 15-minute read spike', () => {
    expect(COST_FREEZE_ENABLED).toBe(true)
    expect(COST_FREEZE_MESSAGE).toContain('bakım')
  })

  it('middleware intercepts pages and APIs before tenant/DB, except health', () => {
    const mw = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
    expect(mw).toContain('COST_FREEZE_ENABLED')
    expect(mw).toContain("status: 503")
    expect(mw).toContain('api/health')
    expect(mw).toContain("'/((?!api/health|bakim.html|_next/static|_next/image|favicon.ico).*)'")
    expect(mw).not.toContain('.*\\\\.[\\\\w]+$')
    const freezeBlock = mw.slice(mw.indexOf('if (COST_FREEZE_ENABLED)'), mw.indexOf('const { pathname } = request.nextUrl', mw.indexOf('if (COST_FREEZE_ENABLED)') + 10))
    expect(freezeBlock).not.toContain('resolveTenantFromRequest')
    expect(freezeBlock).not.toContain('verifyCmsSessionToken')
  })

  it('redirects every public path to a static page before route handlers', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
    const page = readFileSync(join(process.cwd(), 'public/bakim.html'), 'utf8')
    expect(config).toContain('COST_FREEZE_ENABLED')
    expect(config).toContain("destination: '/bakim.html'")
    expect(config).toContain("'/((?!api/health|bakim.html|_next/static|_next/image|favicon.ico).*)'")
    expect(page).toContain('NaHaber kısa süreli bakım çalışmasındadır.')
    expect(page).not.toContain('getDb')
    expect(page).not.toContain('firestore')
  })

  it('stops schedules again while the read spike is investigated', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    expect(vercel.crons).toEqual([])
    const tick = readFileSync(join(process.cwd(), 'src/app/api/cron/crawler/tick/route.ts'), 'utf8')
    expect(tick).toContain('runCrawlerTick')
    expect(tick).toContain('isGlobalCrawlerEnabled')
    const joined = vercel.crons.map((c) => c.path).join('\n')
    expect(joined).not.toContain('crawler-ai-worker')
    expect(joined).not.toContain('editor-ai-queue')
    expect(joined).not.toContain('publisher-')
  })

  it('health stays DB-free and reports freeze', () => {
    const health = readFileSync(join(process.cwd(), 'src/app/api/health/route.ts'), 'utf8')
    expect(health).toContain("runtime = 'edge'")
    expect(health).toContain('COST_FREEZE_ENABLED')
    expect(health).not.toContain('getDb')
    expect(health).not.toContain('getAdminFirestore')
  })
})
