import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ host: 'www.nahaber.com' }))
vi.mock('next/headers', () => ({ headers: async () => new Map([['host', state.host]]) }))
vi.mock('@/lib/sitemap/seoSitemaps', () => ({ getIndexableTopicPaths: async () => ['/etiket/gundem'] }))

import robots from '@/app/robots'

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }
const rules = async () => {
  const r = await robots()
  return (Array.isArray(r.rules) ? r.rules : [r.rules]) as Rule[]
}
const forUa = (rs: Rule[], ua: string) => rs.find((x) => [x.userAgent].flat().includes(ua))!

describe('FinOps 13 Nov: /etiket/ long tail off for all crawlers', () => {
  it('www: * disallows /etiket/ but allows SEO-gated topic pages', async () => {
    state.host = 'www.nahaber.com'
    const star = forUa(await rules(), '*')
    expect(star.disallow).toContain('/etiket/')
    expect([star.allow].flat()).toEqual(['/', '/etiket/gundem'])
  })

  it('www: Googlebot-News keeps articles and gated topics, not the whole /etiket/', async () => {
    state.host = 'www.nahaber.com'
    const news = forUa(await rules(), 'Googlebot-News')
    expect([news.allow].flat()).toContain('/haber/')
    expect([news.allow].flat()).toContain('/etiket/gundem')
    expect([news.allow].flat()).not.toContain('/etiket/')
  })

  it('city host: * disallows /etiket/', async () => {
    state.host = 'canakkale.nahaber.com'
    expect(forUa(await rules(), '*').disallow).toContain('/etiket/')
  })
})
