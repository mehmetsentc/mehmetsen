import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COST_FREEZE_ENABLED, COST_FREEZE_MESSAGE } from '@/lib/costFreeze'

describe('FINOPS cost freeze', () => {
  it('stays wired and is off so the product is live', () => {
    expect(COST_FREEZE_ENABLED).toBe(false)
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

  it('keeps only the crawler tick, the social worker and daily city service syncs; AI and publisher schedules stay off', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons: Array<{ path: string; schedule: string }>
    }
    // Görev 15 dar istisna: hesap bazlı sosyal otomasyon çalışanı (kullanıcı onaylı, 5 dk).
    // Açık kural yokken haber taramaz; AI çağırmaz; tek ortak çalışan.
    // CITY-SERVICES-1 (user-approved 2026-10-16): once-a-day city service syncs are back —
    // nöbetçi eczane (2), etkinlik (1), İŞKUR/Kariyer ilanları (2). No AI, no publishing.
    expect(vercel.crons).toEqual([
      { path: '/api/cron/crawler/tick', schedule: '0 * * * *' },
      { path: '/api/cron/social-automation', schedule: '*/5 * * * *' },
      { path: '/api/cron/iskur-jobs?city=canakkale', schedule: '0 6 * * *' },
      { path: '/api/cron/iskur-jobs?city=antalya', schedule: '15 6 * * *' },
      { path: '/api/cron/antalya-nobetci-eczane', schedule: '30 6 * * *' },
      { path: '/api/cron/canakkale-nobetci-eczane', schedule: '0 7 * * *' },
      { path: '/api/events/sync', schedule: '0 21 * * *' },
    ])
    const worker = readFileSync(join(process.cwd(), 'src/lib/social/automation/worker.ts'), 'utf8')
    expect(worker).not.toContain('generateSocialContent')
    expect(worker).not.toContain('rewriteForPlatform')
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
