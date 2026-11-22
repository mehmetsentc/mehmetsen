import { describe, expect, it } from 'vitest'
import {
  agreementRate,
  buildPreferenceProfile,
  dueSlot,
  evaluateShadow,
  scoreCandidates,
  slotToMs,
  successfulTargets,
  validateSlots,
  type AgentCandidate,
  type ShareDecision,
} from './core'
import type { NewsFacts } from '@/lib/social/automation/match'

const NOW = Date.parse('2026-11-23T10:05:00Z') // 13:05 İstanbul
const facts = (id: string, over: Partial<NewsFacts> = {}): NewsFacts => ({
  id, status: 'published', publishedAt: NOW - 60 * 60_000, citySlug: 'canakkale', districtSlug: '',
  categoryId: 'yerel-asayis', originalCategoryId: '', featured: false, localFeatured: false,
  publisherId: null, countrySlug: '', country: 'türkiye', eligibleAt: null, ...over,
})
const dec = (i: number, over: Partial<ShareDecision> = {}): ShareDecision => ({
  newsId: `n${i}`, accountId: 'ig_1', platform: 'instagram', format: 'post', at: NOW - i * 3_600_000,
  actorUid: 'u', source: 'composer', categoryId: 'yerel-asayis', citySlug: 'canakkale', featured: false,
  newsPublishedAt: NOW - i * 3_600_000 - 20 * 60_000, ...over,
})

describe('vekil editör çekirdeği (Görev 43)', () => {
  it('başarılı hedefleri çıkarır; legacy ve başarısızları atlar', () => {
    expect(
      successfulTargets({
        post: { instagram: { success: true, accountId: 'ig_1' }, facebook: { success: false, accountId: 'fb_1' }, threads: { success: true, accountId: 'legacy' } },
        story: { instagram: { ok: true, account: 'ig_1' } },
      })
    ).toEqual([
      { platform: 'instagram', format: 'post', accountId: 'ig_1' },
      { platform: 'instagram', format: 'story', accountId: 'ig_1' },
    ])
  })

  it('profil: kategori payı, öne çıkan payı, gecikme', () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => dec(i + 1)),
      ...Array.from({ length: 4 }, (_, i) => dec(i + 10, { categoryId: 'yerel-spor', featured: true })),
      dec(1, { format: 'story' }), // aynı haber, farklı biçim → tek seçim
      dec(30, { accountId: 'baska' }),
    ]
    const p = buildPreferenceProfile('ig_1', rows, NOW)
    expect(p.samples).toBe(10)
    expect(p.categories['yerel-asayis']).toBeCloseTo(0.6)
    expect(p.featuredShare).toBeCloseTo(0.4)
    expect(p.medianDelayMin).toBe(20)
    expect(p.formats.story).toBeCloseTo(1 / 11)
  })

  it('puanlama: tercih edilen kategori ve tazelik öne; elenmesi gerekenler elenir', () => {
    const p = buildPreferenceProfile('ig_1', Array.from({ length: 10 }, (_, i) => dec(i + 1)), NOW)
    const c = (f: NewsFacts, o: Partial<AgentCandidate> = {}): AgentCandidate => ({ facts: f, title: f.id, hasImage: true, sensitivityLevel: 0, ...o })
    const scored = scoreCandidates(p, [
      c(facts('fav')),
      c(facts('other', { categoryId: 'ekonomi' })),
      c(facts('old', { publishedAt: NOW - 13 * 3_600_000 })),
      c(facts('noimg'), { hasImage: false }),
      c(facts('lvl3'), { sensitivityLevel: 3 }),
      c(facts('shared')),
      c(facts('draft', { status: 'draft' })),
    ], NOW, new Set(['shared']))
    expect(scored.map((s) => s.newsId)).toEqual(['fav', 'other'])
    expect(scored[0].reasons[0]).toMatch(/kategori payı/)
  })

  it('aralıklar: doğrulama ve sıradaki dolmuş aralık', () => {
    expect(validateSlots(['13:00', '09:00', '09:00'])).toEqual(['09:00', '13:00'])
    expect(validateSlots(['25:00'])).toBeNull()
    const ran = new Set<string>()
    const due = dueSlot({ slots: ['09:00', '13:00', '18:00'] }, NOW, (k) => ran.has(k))
    expect(due?.slotKey).toBe('2026-11-23 13:00')
    expect(due?.windowStart).toBe(slotToMs('2026-11-23', '09:00'))
    ran.add('2026-11-23 13:00')
    expect(dueSlot({ slots: ['09:00', '13:00'] }, NOW, (k) => ran.has(k))).toBeNull()
    // 30 dk'dan eski aralık sonradan doldurulmaz
    expect(dueSlot({ slots: ['09:00'] }, NOW, () => false)).toBeNull()
  })

  it('gölge karşılaştırma ve uyum oranı', () => {
    expect(evaluateShadow(['a', 'b'], [])).toMatchObject({ editorActed: false, anyPickMatched: null })
    expect(evaluateShadow(['a', 'b'], ['b'])).toMatchObject({ editorActed: true, topPickMatched: false, anyPickMatched: true })
    expect(agreementRate([
      { editorActed: true, anyPickMatched: true },
      { editorActed: true, anyPickMatched: false },
      { editorActed: false, anyPickMatched: null },
    ])).toEqual({ comparable: 2, matched: 1, rate: 0.5 })
  })
})
