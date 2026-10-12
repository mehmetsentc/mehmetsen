import { describe, expect, it } from 'vitest'
import { evaluateRule, evaluateRuleConditions, newsFactsFrom, summarizeRule, type NewsFacts } from './match'
import { validateRuleInput, type AutomationRule, type AutomationRuleInput } from './types'

const T0 = 1_760_000_000_000

function news(over: Partial<NewsFacts> = {}): NewsFacts {
  return {
    id: 'n1',
    status: 'published',
    publishedAt: T0 + 60_000,
    citySlug: 'antalya',
    districtSlug: '',
    categoryId: 'yerel-asayis',
    originalCategoryId: '',
    featured: false,
    localFeatured: false,
    eligibleAt: null,
    publisherId: null,
    countrySlug: '',
    country: '',
    ...over,
  }
}

function input(over: Partial<AutomationRuleInput> = {}): AutomationRuleInput {
  return {
    name: 'Antalya yerel',
    accountId: 'instagram_1',
    geo: { kind: 'provinces', citySlugs: ['antalya'] },
    categoryIds: ['yerel-asayis', 'yerel-spor'],
    allCategories: false,
    featuredMode: 'categories_only',
    featuredKind: 'either',
    formats: ['post'],
    dailyLimit: 10,
    minIntervalMinutes: 30,
    quietHours: null,
    ...over,
  }
}

function rule(over: Partial<AutomationRuleInput> = {}, enabled = true): AutomationRule {
  return {
    ...input(over),
    id: 'r1',
    platform: 'instagram',
    ownership: { citySlug: 'antalya', publisherId: null },
    enabled,
    enabledAt: enabled ? T0 : null,
    createdAt: T0,
    createdBy: 'u',
    updatedAt: T0,
    updatedBy: 'u',
  }
}

describe('automation rule matching', () => {
  it('Antalya haberi Antalya kuralına uyar, Ankara haberi uymaz (yanlış hesaba gönderim yok)', () => {
    expect(evaluateRule(rule(), news()).match).toBe(true)
    const ankara = evaluateRule(rule(), news({ citySlug: 'ankara' }))
    expect(ankara.match).toBe(false)
    expect(ankara.reasons[0]).toContain('İl eşleşmedi')
  })

  it('alt kategori sessizce kapsanmaz: yalnız açıkça seçilen kategori (ve yerel karşılığı) eşleşir', () => {
    expect(evaluateRule(rule(), news({ categoryId: 'yerel-spor' })).match).toBe(true)
    expect(evaluateRule(rule(), news({ categoryId: 'gundem' })).match).toBe(false)
    const spor = rule({ categoryIds: ['spor'] })
    expect(evaluateRule(spor, news({ categoryId: 'futbol' })).match).toBe(false)
    expect(evaluateRule(spor, news({ categoryId: 'yerel-spor' })).match).toBe(true) // Yerel Spor ≙ Spor
    expect(evaluateRule(rule({ categoryIds: ['spor', 'futbol'] }), news({ categoryId: 'futbol' })).match).toBe(true)
  })

  it('son-dakikaya taşınan haber önceki kategorisiyle eşleşir', () => {
    expect(evaluateRule(rule(), news({ categoryId: 'son-dakika', originalCategoryId: 'yerel-asayis' })).match).toBe(true)
  })

  it('geriye dönük paylaşım yok: kural açılmadan önce yayımlanan haber eşleşmez', () => {
    const r = evaluateRule(rule(), news({ publishedAt: T0 - 1 }))
    expect(r.match).toBe(false)
    expect(r.reasons[0]).toContain('geriye dönük')
  })

  it('kapalı kural, taslak / kaldırılmış haber eşleşmez', () => {
    expect(evaluateRule(rule({}, false), news()).match).toBe(false)
    expect(evaluateRule(rule(), news({ status: 'draft' })).match).toBe(false)
    expect(evaluateRule(rule(), news({ status: 'archived', publishedAt: null })).match).toBe(false)
  })

  it('ulusal ≠ tüm iller: yerel kapsamlı haber ulusal kurala girmez', () => {
    const nat = rule({ geo: { kind: 'national' }, categoryIds: ['gundem'] })
    expect(evaluateRule(nat, news({ categoryId: 'gundem', citySlug: 'ankara' })).match).toBe(true)
    expect(evaluateRule(nat, news({ categoryId: 'yerel-gundem' })).match).toBe(false)
  })

  it('ilçe koşulu yalnızca o ilin o ilçelerini alır', () => {
    const r = rule({ geo: { kind: 'districts', citySlug: 'canakkale', districtSlugs: ['biga'] } })
    expect(evaluateRule(r, news({ citySlug: 'canakkale', districtSlug: 'biga' })).match).toBe(true)
    expect(evaluateRule(r, news({ citySlug: 'canakkale', districtSlug: 'ezine' })).match).toBe(false)
    // Eski kayıt: ilçe citySlug olarak yazılmış
    expect(evaluateRule(r, news({ citySlug: 'biga' })).match).toBe(true)
  })

  it('«seçilen kategoriler veya öne çıkanlar» ile «seçilen kategorilerde yalnızca öne çıkanlar» ayrımı', () => {
    const orRule = rule({ featuredMode: 'categories_or_featured', categoryIds: ['spor'] })
    const andRule = rule({ featuredMode: 'featured_in_categories', categoryIds: ['yerel-asayis'] })
    const plain = news({ categoryId: 'yerel-asayis' })
    const pinned = news({ categoryId: 'yerel-asayis', localFeatured: true })
    expect(evaluateRule(orRule, plain).match).toBe(false)
    expect(evaluateRule(orRule, pinned).match).toBe(true)
    expect(evaluateRule(andRule, plain).match).toBe(false)
    expect(evaluateRule(andRule, pinned).match).toBe(true)
  })

  it('öne çıkan türü: ulusal manşet ile il manşeti ayrı', () => {
    const n = news({ categoryId: 'gundem', featured: true })
    expect(evaluateRuleConditions(input({ featuredMode: 'featured_only', categoryIds: [], featuredKind: 'national' }), n).match).toBe(true)
    expect(evaluateRuleConditions(input({ featuredMode: 'featured_only', categoryIds: [], featuredKind: 'local' }), n).match).toBe(false)
  })

  it('özet okunabilir VE/VEYA metni üretir', () => {
    const s = summarizeRule(input({ featuredMode: 'categories_or_featured', formats: ['post', 'story'], quietHours: { startHour: 23, endHour: 7 } }))
    expect(s).toContain('İl: Antalya')
    expect(s).toContain('VEYA öne çıkan')
    expect(s).toContain('gönderi + hikâye')
    expect(s).toContain('23:00–07:00')
  })

  it('newsFactsFrom Timestamp ve sayı publishedAt okur', () => {
    expect(newsFactsFrom('x', { publishedAt: 5, status: 'Published' }).publishedAt).toBe(5)
    expect(newsFactsFrom('x', { publishedAt: { toMillis: () => 7 } }).publishedAt).toBe(7)
    expect(newsFactsFrom('x', { status: 'published' }).status).toBe('published')
  })
})

describe('validateRuleInput', () => {
  const ok = { ...input() }
  it('geçerli girdi kabul edilir; sahiplik/platform/enabled istemciden alınmaz', () => {
    const r = validateRuleInput({ ...ok, ownership: { citySlug: 'ankara' }, enabled: true, platform: 'facebook' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).not.toHaveProperty('ownership')
      expect(r.value).not.toHaveProperty('enabled')
      expect(r.value).not.toHaveProperty('platform')
    }
  })
  it('kategori seçilmeden «tüm kategoriler» varsayılmaz', () => {
    expect(validateRuleInput({ ...ok, categoryIds: [] }).ok).toBe(false)
    expect(validateRuleInput({ ...ok, categoryIds: [], allCategories: true }).ok).toBe(true)
  })
  it('bilinmeyen il / başka ilin ilçesi reddedilir', () => {
    expect(validateRuleInput({ ...ok, geo: { kind: 'provinces', citySlugs: ['atlantis'] } }).ok).toBe(false)
    expect(validateRuleInput({ ...ok, geo: { kind: 'districts', citySlug: 'antalya', districtSlugs: ['biga'] } }).ok).toBe(false)
    expect(validateRuleInput({ ...ok, geo: { kind: 'provinces', citySlugs: [] } }).ok).toBe(false)
  })
  it('limitler ve biçimler doğrulanır', () => {
    expect(validateRuleInput({ ...ok, dailyLimit: 0 }).ok).toBe(false)
    expect(validateRuleInput({ ...ok, dailyLimit: 51 }).ok).toBe(false)
    expect(validateRuleInput({ ...ok, minIntervalMinutes: 1 }).ok).toBe(false)
    expect(validateRuleInput({ ...ok, formats: ['reel'] }).ok).toBe(false)
    expect(validateRuleInput({ ...ok, quietHours: { startHour: 3, endHour: 3 } }).ok).toBe(false)
    expect(validateRuleInput({ ...ok, accountId: 'legacy' }).ok).toBe(false)
  })
})

describe('Görev 18 — konum sınıflandırması', () => {
  it('kategorisi ve ili olmayan haber ulusal / il / dünya sayılmaz; «tüm haberler» konumu belirsiz haberi kapsar', async () => {
    const { geoMatch, locationMissing } = await import('./match')
    const bare = newsFactsFrom('x', { status: 'published' })
    expect(locationMissing(bare)).toBe(true)
    expect(geoMatch({ geo: { kind: 'national' } }, bare).ok).toBe(false)
    expect(geoMatch({ geo: { kind: 'world' } }, bare).ok).toBe(false)
    expect(geoMatch({ geo: { kind: 'all_provinces' } }, bare).ok).toBe(false)
    expect(geoMatch({ geo: { kind: 'provinces', citySlugs: ['antalya'] } }, bare).ok).toBe(false)
    const anyBare = geoMatch({ geo: { kind: 'any' } }, bare)
    expect(anyBare.ok).toBe(true)
    expect(anyBare.reason).toContain('belirsiz')
    const yerelNoCity = newsFactsFrom('y', { categoryId: 'yerel-asayis' })
    expect(geoMatch({ geo: { kind: 'any' } }, yerelNoCity).ok).toBe(true)
    expect(geoMatch({ geo: { kind: 'all_provinces' } }, yerelNoCity).ok).toBe(false)
    expect(geoMatch({ geo: { kind: 'national' } }, yerelNoCity).ok).toBe(false)
    const national = newsFactsFrom('z', { categoryId: 'gundem' })
    expect(geoMatch({ geo: { kind: 'national' } }, national).ok).toBe(true)
    expect(geoMatch({ geo: { kind: 'world' } }, national).ok).toBe(false)
    expect(geoMatch({ geo: { kind: 'any' } }, national).ok).toBe(true)
    expect(geoMatch({ geo: { kind: 'any' } }, newsFactsFrom('w', { categoryId: 'yerel-asayis', citySlug: 'izmir' })).ok).toBe(true)
  })

  it('Dünya ulusal sayılmaz; dünya yalnız gerçek alanlardan (Dünya kategorisi / yurt dışı konum) belirlenir', async () => {
    const { geoMatch, isWorldNews, isNationalNews, locationMissing } = await import('./match')
    const dunya = newsFactsFrom('d', { categoryId: 'dunya', countrySlug: 'almanya', country: 'Almanya' })
    expect(isWorldNews(dunya)).toBe(true)
    expect(isNationalNews(dunya)).toBe(false)
    expect(geoMatch({ geo: { kind: 'world' } }, dunya).ok).toBe(true)
    expect(geoMatch({ geo: { kind: 'national' } }, dunya).ok).toBe(false)
    expect(locationMissing(dunya)).toBe(false)
    // Yurt dışı konumlu ama başka kategoride (ör. Spor) → dünya, ulusal değil.
    const abroadSport = newsFactsFrom('a', { categoryId: 'spor', countrySlug: 'ingiltere' })
    expect(isWorldNews(abroadSport)).toBe(true)
    expect(geoMatch({ geo: { kind: 'national' } }, abroadSport).ok).toBe(false)
    // CMS 'Türkiye' yalnız yurt içi il ile yazar; AI 'Türkiye' yedeği dünya sayılmaz.
    const trCountry = newsFactsFrom('t', { categoryId: 'ekonomi', country: 'Türkiye' })
    expect(isWorldNews(trCountry)).toBe(false)
    expect(isNationalNews(trCountry)).toBe(true)
    // Yurt içi il varsa ülke alanı dünya yapmaz.
    expect(isWorldNews(newsFactsFrom('i', { categoryId: 'yerel-gundem', citySlug: 'izmir', country: 'Almanya' }))).toBe(false)
    // Ulusal olmayan kategori kendiliğinden «Türkiye haberi» sayılmaz: Kıbrıs ulusal değil.
    expect(isNationalNews(newsFactsFrom('k', { categoryId: 'kibris-haberleri' }))).toBe(false)
  })

  it('otomatik hikâye öne çıkan koşulu ister', () => {
    const base = { name: 'k', accountId: 'instagram_1', geo: { kind: 'any' }, categoryIds: ['asayis'], allCategories: false, featuredKind: 'either', dailyLimit: 5, minIntervalMinutes: 15, quietHours: null }
    expect(validateRuleInput({ ...base, featuredMode: 'categories_or_featured', formats: ['story'] }).ok).toBe(false)
    expect(validateRuleInput({ ...base, featuredMode: 'featured_in_categories', formats: ['story'] }).ok).toBe(true)
    expect(validateRuleInput({ ...base, categoryIds: [], featuredMode: 'featured_only', formats: ['post', 'story'] }).ok).toBe(true)
  })
})
