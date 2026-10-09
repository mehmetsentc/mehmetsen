/** Legacy geçiş planı: dry-run yazmaz, apply mükerrer üretmez, kimlik uydurmaz. */
import { describe, expect, it } from 'vitest'
import { FakeFirestore } from './testing/fakeFirestore'
import { applyLegacyMigrationPlan, buildLegacyMigrationPlan, describePlan, type LegacyMigrationInput } from './legacyMigration'
import { parseSocialAccount } from './types'
import { parseSecretRecord } from './secretStore.shared'

const input = (over: Partial<LegacyMigrationInput> = {}): LegacyMigrationInput => ({
  facebookPageId: { value: '104567890123', source: 'FACEBOOK_PAGE_ID' },
  instagramUserId: { value: '17840000000002001', source: 'INSTAGRAM_BUSINESS_ID' },
  threadsUserId: { value: '25012345678', source: 'THREADS_USER_ID' },
  credentialPresent: { facebook: true, instagram: true, threads: true },
  ownership: { citySlug: 'canakkale', publisherId: null },
  actor: 'migration:test',
  now: 1_800_000_000_000,
  existingAccountIds: null,
  ...over,
})

describe('legacy geçiş planı', () => {
  it('üç platform için legacy-referanslı, geçerli kayıt planlar (token yok)', () => {
    const plan = buildLegacyMigrationPlan(input())
    const creates = plan.items.filter((i) => i.action === 'create')
    expect(creates.map((c) => c.accountId)).toEqual(['facebook_104567890123', 'instagram_17840000000002001', 'threads_25012345678'])
    for (const c of creates) {
      if (c.action !== 'create') continue
      expect(parseSocialAccount(c.accountId, c.account)).not.toBeNull()
      expect(c.account.connectionMethod).toBe('legacy')
      expect(parseSecretRecord(c.secret)?.kind).toBe('legacy')
      expect(JSON.stringify(c)).not.toMatch(/token":|accessToken|Encrypted/i)
    }
  })

  it('eksik kimlik uydurulmaz; açıkça raporlanır', () => {
    const plan = buildLegacyMigrationPlan(input({ threadsUserId: { value: null, source: 'THREADS_USER_ID' } }))
    expect(plan.items.find((i) => i.platform === 'threads')).toMatchObject({ action: 'skip' })
    expect(plan.problems.join(' ')).toContain('THREADS_USER_ID')
  })

  it('kimlik bilgisi yoksa kayıt "paused" planlanır ve uyarılır', () => {
    const plan = buildLegacyMigrationPlan(input({ credentialPresent: { facebook: true, instagram: false, threads: true } }))
    const ig = plan.items.find((i) => i.platform === 'instagram')
    expect(ig?.action === 'create' && ig.account.status).toBe('paused')
  })

  it('sahiplik yoksa plan üretilmez', () => {
    expect(buildLegacyMigrationPlan(input({ ownership: { citySlug: null, publisherId: null } })).items).toHaveLength(0)
  })

  it('dry-run (plan + açıklama) hiçbir yazma yapmaz; çıktı kimlikleri maskeler', () => {
    const fs = new FakeFirestore()
    const plan = buildLegacyMigrationPlan(input())
    const text = describePlan(plan).join('\n')
    expect(fs.writes).toBe(0)
    expect(text).not.toContain('104567890123')
    expect(text).toContain('…0123')
  })

  it('apply idempotent: ikinci çalıştırma mevcut kaydı ezmez, mükerrer üretmez', async () => {
    const fs = new FakeFirestore()
    const plan = buildLegacyMigrationPlan(input())
    const first = await applyLegacyMigrationPlan(fs as never, plan)
    expect(first.every((r) => r.result === 'created')).toBe(true)
    const writes = fs.writes
    await fs.collection('socialAccounts').doc('facebook_104567890123').update({ status: 'paused', statusReason: 'elle' })
    const second = await applyLegacyMigrationPlan(fs as never, plan)
    expect(second.every((r) => r.result === 'exists')).toBe(true)
    expect(fs.writes).toBe(writes + 1)
    expect(fs.store.get('socialAccounts/facebook_104567890123')).toMatchObject({ status: 'paused', statusReason: 'elle' })
    expect(fs.docs('socialAccounts')).toHaveLength(3)
  })

  it('mevcut kimlikler okunduğunda plan "exists" gösterir', () => {
    const plan = buildLegacyMigrationPlan(input({ existingAccountIds: new Set(['facebook_104567890123']) }))
    expect(plan.items[0]).toMatchObject({ action: 'exists' })
  })
})
