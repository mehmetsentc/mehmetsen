import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTERS,
  accountState,
  buildViews,
  confirmDiscard,
  createLatestGuard,
  foldTr,
  initials,
  matchesFilters,
  pageList,
  paginate,
  sameDraft,
  scopeKind,
  scopeSummary,
  sortViews,
  summarize,
  type AccountFilters,
  type ListAccount,
} from './accountListView'

const NAMES: Record<string, string> = { antalya: 'Antalya', hatay: 'Hatay', canakkale: 'Çanakkale', izmir: 'İzmir', edirne: 'Edirne', kirklareli: 'Kırklareli', tekirdag: 'Tekirdağ' }
const pn = (s: string) => NAMES[s] ?? s
const cn = (ids: string[]) => ids.map((i) => (i === 'spor' ? 'Spor' : i === 'magazin' ? 'Magazin' : i))

function acc(over: Partial<ListAccount> & { id: string; displayName: string }): ListAccount {
  return {
    platform: 'instagram',
    username: null,
    ownerKind: 'central',
    ownership: { citySlug: null, publisherId: null },
    connectionMethod: 'instagram_login',
    status: 'active',
    tokenExpiresAt: null,
    connectionCheckedAt: 1,
    health: { publishBlocker: null, tokenWarning: false },
    publishScope: { geo: { kind: 'any' }, allCategories: true, categoryIds: [] },
    ...over,
  }
}

describe('accountState — derived only from the real stored state', () => {
  it('active without blocker is ready', () => {
    expect(accountState(acc({ id: 'instagram_1', displayName: 'A' }))).toBe('ready')
  })
  it('needs_reauth / expired / missing permission → reconnect', () => {
    expect(accountState(acc({ id: 'instagram_1', displayName: 'A', status: 'needs_reauth' }))).toBe('reconnect')
    expect(accountState(acc({ id: 'instagram_1', displayName: 'A', health: { publishBlocker: 'token_expired', tokenWarning: true } }))).toBe('reconnect')
    expect(accountState(acc({ id: 'instagram_1', displayName: 'A', health: { publishBlocker: 'publish_permission_missing', tokenWarning: false } }))).toBe('reconnect')
  })
  it('unverified publish permission is never shown as healthy', () => {
    expect(accountState(acc({ id: 'instagram_1', displayName: 'A', health: { publishBlocker: 'publish_permission_unverified', tokenWarning: false } }))).toBe('unverified')
  })
  it('paused and disconnected are their own states', () => {
    expect(accountState(acc({ id: 'instagram_1', displayName: 'A', status: 'paused', health: { publishBlocker: 'status_paused', tokenWarning: false } }))).toBe('paused')
    expect(accountState(acc({ id: 'instagram_1', displayName: 'A', status: 'disabled', health: { publishBlocker: 'status_disabled', tokenWarning: false } }))).toBe('disconnected')
  })
  it('expiring soon only flags accounts that are not auto-renewed', () => {
    expect(accountState(acc({ id: 'facebook_1', displayName: 'A', connectionMethod: 'facebook_login', health: { publishBlocker: null, tokenWarning: true } }))).toBe('expiring')
    expect(accountState(acc({ id: 'instagram_1', displayName: 'A', connectionMethod: 'instagram_login', health: { publishBlocker: null, tokenWarning: true } }))).toBe('ready')
  })
})

describe('content scope stays separate from ownership', () => {
  it('central team running a local account is classified by scope, not owner', () => {
    const a = acc({ id: 'instagram_2', displayName: 'Antalya NaHaber', ownerKind: 'central', publishScope: { geo: { kind: 'provinces', citySlugs: ['antalya'] }, allCategories: true, categoryIds: [] } })
    expect(a.ownerKind).toBe('central')
    expect(scopeKind(a)).toBe('province')
  })
  it('classifies general / region / category / location+category', () => {
    expect(scopeKind(acc({ id: 'x_1', displayName: 'a' }))).toBe('general')
    expect(scopeKind(acc({ id: 'x_1', displayName: 'a', publishScope: { geo: { kind: 'provinces', citySlugs: ['edirne', 'kirklareli', 'tekirdag'] }, allCategories: true, categoryIds: [] } }))).toBe('region')
    expect(scopeKind(acc({ id: 'x_1', displayName: 'a', publishScope: { geo: { kind: 'any' }, allCategories: false, categoryIds: ['magazin'] } }))).toBe('category')
    expect(scopeKind(acc({ id: 'x_1', displayName: 'a', publishScope: { geo: { kind: 'districts', citySlug: 'hatay', districtSlugs: ['antakya'] }, allCategories: false, categoryIds: ['spor'] } }))).toBe('location_category')
    expect(scopeKind(acc({ id: 'x_1', displayName: 'a', publishScope: undefined }))).toBeNull()
  })
  it('summarises the scope briefly with the full text available', () => {
    expect(scopeSummary(acc({ id: 'x_1', displayName: 'a', publishScope: { geo: { kind: 'provinces', citySlugs: ['edirne', 'kirklareli', 'tekirdag'] }, allCategories: true, categoryIds: [] } }), pn, cn)).toEqual({
      short: '3 il',
      full: 'Edirne, Kırklareli, Tekirdağ · tüm kategoriler',
    })
    expect(scopeSummary(acc({ id: 'x_1', displayName: 'a', publishScope: { geo: { kind: 'any' }, allCategories: false, categoryIds: ['magazin'] } }), pn, cn).short).toBe('Magazin')
  })
})

describe('summary counts cover every visible account', () => {
  const accounts = Array.from({ length: 48 }, (_, i) =>
    acc({
      id: `instagram_${i}`,
      displayName: `Hesap ${i}`,
      status: i < 3 ? 'needs_reauth' : 'active',
      health: { publishBlocker: i === 3 ? 'publish_permission_unverified' : null, tokenWarning: false },
    }),
  )
  const rules = [
    { accountId: 'instagram_10', enabled: true },
    { accountId: 'instagram_10', enabled: true },
    { accountId: 'instagram_11', enabled: true },
    { accountId: 'instagram_12', enabled: false },
  ]
  const views = buildViews(accounts, rules)
  it('totals are independent of the page shown', () => {
    expect(paginate(views, 1, 25).items).toHaveLength(25)
    expect(summarize(views)).toEqual({ total: 48, ready: 44, attention: 4, automationOn: 2 })
  })
  it('«Otomasyon açık» counts accounts with ≥1 enabled rule, not rules', () => {
    expect(views.find((v) => v.account.id === 'instagram_10')?.enabledRules).toBe(2)
    expect(summarize(views).automationOn).toBe(2)
  })
})

describe('search and filters', () => {
  const views = buildViews(
    [
      acc({ id: 'facebook_1', displayName: 'Çanakkale NaHaber', username: 'onyeditivi', platform: 'facebook', ownerKind: 'province', ownership: { citySlug: 'canakkale', publisherId: null }, publishScope: { geo: { kind: 'provinces', citySlugs: ['canakkale'] }, allCategories: true, categoryIds: [] } }),
      acc({ id: 'instagram_2', displayName: 'Antalya NaHaber', username: 'antalya_nahaber_com', publishScope: { geo: { kind: 'provinces', citySlugs: ['antalya'] }, allCategories: true, categoryIds: [] } }),
      acc({ id: 'instagram_3', displayName: 'İzmir Gündem', ownerKind: 'user', status: 'needs_reauth', publishScope: { geo: { kind: 'provinces', citySlugs: ['izmir'] }, allCategories: true, categoryIds: [] } }),
      acc({ id: 'instagram_4', displayName: 'Televole', username: 'tele_vole', publishScope: { geo: { kind: 'any' }, allCategories: false, categoryIds: ['magazin'] } }),
    ],
    [{ accountId: 'instagram_2', enabled: true }],
  )
  const run = (f: Partial<AccountFilters>) => views.filter((v) => matchesFilters(v, { ...EMPTY_FILTERS, ...f }, pn)).map((v) => v.account.id)

  it('searches name and username without Turkish-character sensitivity', () => {
    expect(run({ q: 'canakkale' })).toEqual(['facebook_1'])
    expect(run({ q: '@ONYEDITIVI' })).toEqual(['facebook_1'])
    expect(run({ q: 'izmir' })).toEqual(['instagram_3'])
  })
  it('searches the il of the ownership or scope', () => {
    expect(run({ q: 'antalya' })).toEqual(['instagram_2'])
  })
  it('combines platform, owner, scope, status and automation filters', () => {
    expect(run({ platform: 'facebook' })).toEqual(['facebook_1'])
    expect(run({ owner: 'central' })).toEqual(['instagram_2', 'instagram_4'])
    expect(run({ scope: 'category' })).toEqual(['instagram_4'])
    expect(run({ status: 'attention' })).toEqual(['instagram_3'])
    expect(run({ status: 'ready_any', automation: 'off' })).toEqual(['facebook_1', 'instagram_4'])
    expect(run({ automation: 'on' })).toEqual(['instagram_2'])
  })
  it('folds Turkish letters', () => {
    expect(foldTr('ÇĞIİÖŞÜ çğıiöşü')).toBe('cgiiosu cgiiosu')
  })
})

describe('sorting', () => {
  const views = buildViews(
    [
      acc({ id: 'instagram_1', displayName: 'Zonguldak' }),
      acc({ id: 'instagram_2', displayName: 'Çanakkale' }),
      acc({ id: 'facebook_3', displayName: 'Ankara', platform: 'facebook', status: 'needs_reauth' }),
      acc({ id: 'instagram_4', displayName: 'Ceyhan' }),
      acc({ id: 'instagram_5', displayName: 'İzmir', health: { publishBlocker: 'publish_permission_unverified', tokenWarning: false } }),
      acc({ id: 'instagram_6', displayName: 'Ilgaz' }),
    ],
    [],
  )
  const names = (key: Parameters<typeof sortViews>[1], dir?: 'asc' | 'desc') => sortViews(views, key, dir).map((v) => v.account.displayName)

  it('default: accounts needing action first, then Turkish alphabetical', () => {
    expect(names('default')).toEqual(['Ankara', 'İzmir', 'Ceyhan', 'Çanakkale', 'Ilgaz', 'Zonguldak'])
  })
  it('name / platform / status sorts are stable and reversible', () => {
    expect(names('name')).toEqual(['Ankara', 'Ceyhan', 'Çanakkale', 'Ilgaz', 'İzmir', 'Zonguldak'])
    expect(names('name', 'desc')[0]).toBe('Zonguldak')
    expect(names('platform')).toEqual(['Ceyhan', 'Çanakkale', 'Ilgaz', 'İzmir', 'Zonguldak', 'Ankara'])
    expect(names('status').slice(0, 2)).toEqual(['Ankara', 'İzmir'])
    expect(sortViews(views, 'name')).toEqual(sortViews([...views].reverse(), 'name'))
  })
  it('never merges same-brand accounts on different platforms', () => {
    const v = buildViews([acc({ id: 'instagram_1', displayName: 'NaHaber' }), acc({ id: 'facebook_1', displayName: 'NaHaber', platform: 'facebook' })], [])
    expect(sortViews(v, 'name')).toHaveLength(2)
  })
})

describe('pagination', () => {
  const list = Array.from({ length: 48 }, (_, i) => i)
  it('pages without silently dropping records', () => {
    const p1 = paginate(list, 1, 25)
    const p2 = paginate(list, 2, 25)
    expect([p1.from, p1.to, p1.total, p1.pages]).toEqual([1, 25, 48, 2])
    expect([p2.from, p2.to]).toEqual([26, 48])
    expect([...p1.items, ...p2.items]).toEqual(list)
  })
  it('clamps out-of-range pages (e.g. after a filter shrinks the list)', () => {
    expect(paginate(list, 9, 25).page).toBe(2)
    expect(paginate([], 3, 25)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, total: 0 })
  })
  it('lists page buttons with gaps', () => {
    expect(pageList(1, 3)).toEqual([1, 2, 3])
    expect(pageList(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12])
  })
})

describe('edit safety', () => {
  it('drops a late response for the previously opened account', async () => {
    const guard = createLatestGuard()
    const shown: string[] = []
    const load = (id: string, ms: number) => {
      const t = guard.begin()
      return new Promise<void>((r) => setTimeout(r, ms)).then(() => {
        if (guard.isCurrent(t)) shown.push(id)
      })
    }
    const slow = load('hatay', 30)
    const fast = load('antalya', 5)
    await Promise.all([slow, fast])
    expect(shown).toEqual(['antalya'])
  })
  it('cancel() drops a pending response after the panel closes', async () => {
    const guard = createLatestGuard()
    const t = guard.begin()
    guard.cancel()
    expect(guard.isCurrent(t)).toBe(false)
  })
  it('asks before discarding unsaved changes', () => {
    let asked = 0
    expect(confirmDiscard(false, () => (asked++, false))).toBe(true)
    expect(asked).toBe(0)
    expect(confirmDiscard(true, () => (asked++, false))).toBe(false)
    expect(confirmDiscard(true, () => true)).toBe(true)
  })
  it('a re-ordered but identical scope draft is not dirty', () => {
    expect(sameDraft({ geo: { kind: 'provinces', citySlugs: ['a', 'b'] }, categoryIds: [] }, { categoryIds: [], geo: { citySlugs: ['b', 'a'], kind: 'provinces' } })).toBe(true)
    expect(sameDraft({ allCategories: true }, { allCategories: false })).toBe(false)
  })
  it('avatar fallback initials', () => {
    expect(initials('Antalya NaHaber')).toBe('AN')
    expect(initials('ilgaz')).toBe('İL')
    expect(initials('')).toBe('?')
  })
})
