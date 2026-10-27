/**
 * FinOps 27 Oct — Claude-SearchBot: articles on www stay crawlable,
 * tag/author long-tail pages and city hosts are off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ host: 'www.nahaber.com' }))
vi.mock('next/headers', () => ({ headers: async () => new Map([['host', state.host]]) }))

import robots from '@/app/robots'

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }
const rulesOf = (r: Awaited<ReturnType<typeof robots>>) => (Array.isArray(r.rules) ? r.rules : [r.rules]) as Rule[]
const uas = (x: Rule) => (Array.isArray(x.userAgent) ? x.userAgent : [x.userAgent ?? ''])
const BOT = 'Claude-SearchBot'

describe('Claude-SearchBot robots rule', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.nahaber.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('www: keeps articles, drops /etiket/ and /yazar/ and the common private paths', async () => {
    state.host = 'www.nahaber.com'
    const groups = rulesOf(await robots()).filter((x) => uas(x).includes(BOT))
    expect(groups).toHaveLength(1)
    const g = groups[0]
    expect(g.allow).toBe('/')
    expect(g.disallow).toEqual(expect.arrayContaining(['/etiket/', '/yazar/', '/api/', '/admin/']))
    expect(g.disallow).not.toContain('/haber/')
    expect(g.disallow).not.toContain('/kategori/')
  })

  it.each(['canakkale.nahaber.com', 'antalya.nahaber.com'])('%s: Claude-SearchBot is kept off the city host', async (host) => {
    state.host = host
    const groups = rulesOf(await robots()).filter((x) => uas(x).includes(BOT))
    expect(groups).toHaveLength(1)
    expect(groups[0].disallow).toBe('/')
  })

  it('ClaudeBot (training) stays fully disallowed and is not merged with Claude-SearchBot', async () => {
    state.host = 'www.nahaber.com'
    const rules = rulesOf(await robots())
    const cb = rules.find((x) => uas(x).includes('ClaudeBot'))!
    expect(cb.disallow).toBe('/')
    expect(uas(cb)).not.toContain(BOT)
  })
})
