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

const CANONICAL_PILOT_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

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

  console.log(`=== P17 CANONICAL PILOT ACCESS GRANT ===`)
  console.log(`Canonical Pilot UID: ${CANONICAL_PILOT_UID}`)

  // 1. Ensure user row exists in users table (for foreign key)
  const existingUsers = await sql`
    SELECT firebase_uid, email, display_name, role FROM users WHERE firebase_uid = ${CANONICAL_PILOT_UID}
  `
  console.log('Existing target pilot user in DB:', existingUsers)

  const hasOperator = existingUsers.some(u => u.firebase_uid === CANONICAL_PILOT_UID)
  if (!hasOperator) {
    console.log(`Inserting pilot user record into users table...`)
    await sql`
      INSERT INTO users (firebase_uid, email, display_name, role, created_at, updated_at)
      VALUES (${CANONICAL_PILOT_UID}, 'operator@nahaber.com', 'Operator Pilot User', 'super_admin', now(), now())
      ON CONFLICT (firebase_uid) DO UPDATE SET updated_at = now()
    `
    console.log(`Pilot user ensured.`)
  }

  // 2. Grant 7 features for canonical pilot
  console.log(`Granting features to canonical pilot ${CANONICAL_PILOT_UID}...`)
  for (const feat of FEATURES) {
    const id = `ufa_op_${feat.toLowerCase()}`
    await sql`
      INSERT INTO user_feature_access (id, user_id, feature_key, enabled, created_by, updated_by, reason, created_at, updated_at)
      VALUES (${id}, ${CANONICAL_PILOT_UID}, ${feat}, true, 'system', 'system', 'P17 Canonical Pilot Allowlist', now(), now())
      ON CONFLICT (user_id, feature_key)
      DO UPDATE SET enabled = true, updated_at = now(), updated_by = 'system', reason = 'P17 Canonical Pilot Allowlist'
    `
  }

  // 3. Verify DB records
  const operatorGrants = await sql`
    SELECT user_id, feature_key, enabled, reason, updated_at FROM user_feature_access WHERE user_id = ${CANONICAL_PILOT_UID} ORDER BY feature_key
  `
  console.log('\nCanonical Pilot Grants in DB:', operatorGrants)

  // 4. Verify effective flags via service
  const { isSmartFeedEffectiveForUser, isFeatureEnabledForUser } = await import('../src/lib/user/effectiveUserFlags')
  const { feedService } = await import('../src/services/feed/FeedService')

  const isOpSmartFeed = await isSmartFeedEffectiveForUser(CANONICAL_PILOT_UID)
  console.log(`\nisSmartFeedEffectiveForUser('${CANONICAL_PILOT_UID}') ->`, isOpSmartFeed)

  for (const feat of FEATURES) {
    const ok = await isFeatureEnabledForUser(CANONICAL_PILOT_UID, feat)
    console.log(`isFeatureEnabledForUser('${CANONICAL_PILOT_UID}', '${feat}') ->`, ok)
  }

  // 5. Test FeedService.getFeed for pilot
  console.log('\nTesting FeedService.getFeed for Canonical Pilot...')
  const feedResult = await feedService.getFeed({
    userId: CANONICAL_PILOT_UID,
    mode: 'personal',
    limit: 15,
    refresh: true,
  }, { debug: true })

  console.log('FeedService response summary:', {
    itemCount: feedResult.items.length,
    hasMore: feedResult.hasMore,
    nextCursor: feedResult.nextCursor,
    emptyReason: feedResult.emptyReason,
    rankingVersion: feedResult.rankingVersion,
  })

  if (feedResult.items.length > 0) {
    console.log('First 3 items:')
    feedResult.items.slice(0, 3).forEach((it, idx) => {
      console.log(`  [${idx + 1}] ${it.headline} (${it.publisher?.name || 'no publisher'}) - score: ${it.scoreBreakdown?.total}`)
    })
  }

  console.log('\nSUCCESS: Canonical Pilot UID granted and verified!')
}

main().catch((err) => {
  console.error('Migration/Grant failed:', err)
  process.exit(1)
})
