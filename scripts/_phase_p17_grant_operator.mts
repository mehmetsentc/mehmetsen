import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

{
  const require = createRequire(import.meta.url)
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  const stubFile = resolve(stubDir, 'index.js')
  if (!existsSync(stubFile)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(stubFile, 'module.exports = {};\n')
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
  void require
}

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
}

loadEnvLocal()

const PILOT_UIDS = [
  { uid: 'wG8WTNlW38TILLvpDLsFmt8IMlg1', email: 'operator@nahaber.com', name: 'Operator Pilot User', tag: 'op' },
]

const FEATURES = [
  'USER_PROFILES',
  'SOCIAL_GRAPH',
  'SMART_FEED',
  'SMART_FEED_RANKING_V1',
  'COLD_START_V2',
  'SMART_FEED_VIDEO',
  'SMART_FEED_TELEMETRY',
] as const

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log(`=== P17 PILOT ACCESS GRANTS (CANONICAL + GOOGLE AUTH) ===`)

  for (const pilot of PILOT_UIDS) {
    console.log(`\nProcessing Pilot UID: ${pilot.uid} (${pilot.name})...`)

    // 1. Ensure user row exists in users table (for foreign key)
    const existingUsers = await sql`
      SELECT firebase_uid, email, display_name, role FROM users WHERE firebase_uid = ${pilot.uid}
    `
    console.log('Existing target user in DB:', existingUsers)

    if (existingUsers.length === 0) {
      console.log(`Inserting user record into users table...`)
      await sql`
        INSERT INTO users (firebase_uid, email, display_name, role, created_at, updated_at)
        VALUES (${pilot.uid}, ${pilot.email}, ${pilot.name}, 'super_admin', now(), now())
        ON CONFLICT (firebase_uid) DO UPDATE SET updated_at = now()
      `
      console.log(`User record ensured for ${pilot.uid}.`)
    }

    // 2. Grant 7 features
    console.log(`Granting features to ${pilot.uid}...`)
    for (const feat of FEATURES) {
      const id = `ufa_${pilot.tag}_${feat.toLowerCase()}`
      await sql`
        INSERT INTO user_feature_access (id, user_id, feature_key, enabled, created_by, updated_by, reason, created_at, updated_at)
        VALUES (${id}, ${pilot.uid}, ${feat}, true, 'system', 'system', 'P17 Pilot Dual-Allowlist', now(), now())
        ON CONFLICT (user_id, feature_key)
        DO UPDATE SET enabled = true, updated_at = now(), updated_by = 'system', reason = 'P17 Pilot Dual-Allowlist'
      `
    }

    // 3. Verify DB records
    const grants = await sql`
      SELECT user_id, feature_key, enabled, reason, updated_at FROM user_feature_access WHERE user_id = ${pilot.uid} ORDER BY feature_key
    `
    console.log(`Grants in DB for ${pilot.uid}:`, grants)
  }

  // 4. Verify effective flags via service
  const { isSmartFeedEffectiveForUser, isFeatureEnabledForUser } = await import('../src/lib/user/effectiveUserFlags')
  const { feedService } = await import('../src/services/feed/FeedService')

  for (const pilot of PILOT_UIDS) {
    const isOpSmartFeed = await isSmartFeedEffectiveForUser(pilot.uid)
    console.log(`\nisSmartFeedEffectiveForUser('${pilot.uid}') ->`, isOpSmartFeed)

    for (const feat of FEATURES) {
      const ok = await isFeatureEnabledForUser(pilot.uid, feat)
      console.log(`isFeatureEnabledForUser('${pilot.uid}', '${feat}') ->`, ok)
    }

    // Test FeedService.getFeed for both
    console.log(`\nTesting FeedService.getFeed for ${pilot.uid}...`)
    const feedResult = await feedService.getFeed({
      userId: pilot.uid,
      mode: 'personal',
      limit: 15,
      refresh: true,
    }, { debug: true })

    console.log(`FeedService response summary for ${pilot.uid}:`, {
      itemCount: feedResult.items.length,
      hasMore: feedResult.hasMore,
      nextCursor: feedResult.nextCursor,
    })
  }

  console.log('\n=== P17 DUAL PILOT GRANT COMPLETE ===')
}

main().catch(err => {
  console.error('Grant script failed:', err)
  process.exit(1)
})
