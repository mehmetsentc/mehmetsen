import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Account-persisted Yerel location', () => {
  const schema = readFileSync(join(process.cwd(), 'src/db/schema/socialGraph.ts'), 'utf8')
  const mig = readFileSync(
    join(process.cwd(), 'src/db/migrations/0042_phase_feed_local_location_prefs.sql'),
    'utf8'
  )
  const api = readFileSync(
    join(process.cwd(), 'src/app/api/users/me/local-location/route.ts'),
    'utf8'
  )
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const helper = readFileSync(join(process.cwd(), 'src/lib/feed/accountLocalLocation.ts'), 'utf8')
  const ctx = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedUserContextService.ts'),
    'utf8'
  )
  const localGeo = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
    'utf8'
  )
  const pipeline = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedRankingPipeline.ts'),
    'utf8'
  )

  it('extends user_profiles with city_slug + district_slug + clear sentinel', () => {
    expect(schema).toContain("citySlug: varchar('city_slug'")
    expect(schema).toContain("districtSlug: varchar('district_slug'")
    expect(schema).toContain('localNewsClearedAt')
    expect(mig).toContain('city_slug')
    expect(mig).toContain('local_news_cleared_at')
  })

  it('exposes authenticated GET/PUT local-location API', () => {
    expect(api).toContain('export async function GET')
    expect(api).toContain('export async function PUT')
    expect(api).toContain('clear')
    expect(api).not.toMatch(/\bfingerprint\b|\bsilent.?gps\b|\bip.?geoloc/i)
  })

  it('client persists to account and ignores IP as Yerel authority', () => {
    expect(client).toContain('persistAccountLocalLocation')
    expect(client).toContain('fetchAccountLocalLocation')
    expect(client).toContain('clearLocalCity')
    expect(client).toContain("if (source === 'ip') return")
    expect(client).toContain("userLocation.source !== 'ip'")
  })

  it('cleared sentinel blocks resurrection', () => {
    expect(helper).toContain('nahaber-local-news-cleared')
    expect(helper).toContain('account_cleared')
    expect(ctx).toContain('localNewsClearedAt')
  })

  it('preserves 4b3c245 Yerel FS city constraint + no nationwide fill', () => {
    expect(localGeo).toContain('fetchFirestoreLocalByCity')
    expect(localGeo).toContain("where('citySlug', '==', citySlug)")
    expect(pipeline).toContain("input.mode !== 'local'")
    expect(pipeline).toContain('LOCAL_NO_NATIONWIDE_FILL')
  })
})
