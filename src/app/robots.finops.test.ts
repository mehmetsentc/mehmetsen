/**
 * FINOPS-SEO-1 — SEO-tool crawlers are disallowed; search engines are not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ host: 'www.nahaber.com' }))
vi.mock('next/headers', () => ({ headers: async () => new Map([['host', state.host]]) }))

import robots from '@/app/robots'

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }
const rulesOf = (r: Awaited<ReturnType<typeof robots>>) => (Array.isArray(r.rules) ? r.rules : [r.rules]) as Rule[]
const uas = (x: Rule) => (Array.isArray(x.userAgent) ? x.userAgent : [x.userAgent ?? ''])

const BLOCKED = ['SemrushBot', 'AhrefsBot', 'MJ12bot', 'DotBot', 'Reflectionbot', 'Baiduspider']
const SEARCH_ENGINES = [
  'Googlebot',
  'Googlebot-News',
  'Googlebot-Image',
  'Googlebot-Video',
  'Google-InspectionTool',
  'bingbot',
  'YandexBot',
  'Applebot',
  'facebookexternalhit',
  'Twitterbot',
]

describe('FINOPS-SEO-1 robots', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.nahaber.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(['www.nahaber.com', 'canakkale.nahaber.com', 'antalya.nahaber.com'])(
    '%s: SEO-tool crawlers disallowed from everything',
    async (host) => {
      state.host = host
      const rules = rulesOf(await robots())
      for (const bot of BLOCKED) {
        const rule = rules.find((x) => uas(x).includes(bot))
        expect(rule, bot).toBeDefined()
        expect(rule!.disallow).toBe('/')
      }
    }
  )

  it.each(['www.nahaber.com', 'canakkale.nahaber.com'])(
    '%s: no search engine or preview bot is put into a disallow-all group',
    async (host) => {
      state.host = host
      const rules = rulesOf(await robots())
      for (const bot of SEARCH_ENGINES) {
        for (const rule of rules.filter((x) => uas(x).includes(bot))) {
          expect(rule.disallow, bot).not.toBe('/')
        }
      }
      const star = rules.find((x) => uas(x).includes('*'))!
      expect(star.allow).toBe('/')
      expect(star.disallow).not.toContain('/haber/')
      expect(star.disallow).not.toContain('/etiket/')
    }
  )
})
