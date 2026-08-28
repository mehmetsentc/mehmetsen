import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

{
  const require = createRequire(import.meta.url)
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  const stubFile = resolve(stubDir, 'index.js')
  if (!existsSync(stubFile)) {
    const { mkdirSync, writeFileSync } = require('node:fs')
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(stubFile, 'module.exports = {};\n')
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
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
const HISTORICAL_PILOT_UID = 'ap3scBglLIVwflfZN4qL8PKrM1A3'

const PILOT_FEATURES = [
  'USER_PROFILES',
  'SOCIAL_GRAPH',
  'SMART_FEED',
  'SMART_FEED_RANKING_V1',
  'COLD_START_V2',
  'SMART_FEED_VIDEO',
  'SMART_FEED_TELEMETRY',
] as const

async function runCleanup() {
  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== P17.4B: CONTROLLED CLEANUP OF USER_FEATURE_ACCESS ===')
  console.log(`Canonical Pilot UID: ${CANONICAL_PILOT_UID}`)

  // 1. Pre-cleanup counts
  const preActiveUsers = (await sql`SELECT count(DISTINCT user_id)::int as c FROM user_feature_access WHERE enabled = true`)[0].c
  const preTotalRows = (await sql`SELECT count(*)::int as c FROM user_feature_access`)[0].c
  const preActiveRows = (await sql`SELECT count(*)::int as c FROM user_feature_access WHERE enabled = true`)[0].c

  console.log('Pre-cleanup state:', {
    totalRows: preTotalRows,
    activeRows: preActiveRows,
    activeUsers: preActiveUsers,
  })

  // 2. Ensure canonical pilot user has all 7 features enabled
  console.log(`Ensuring 7 grants for canonical pilot ${CANONICAL_PILOT_UID}...`)
  for (const feat of PILOT_FEATURES) {
    const id = `ufa_op_${feat.toLowerCase()}`
    await sql`
      INSERT INTO user_feature_access (id, user_id, feature_key, enabled, created_by, updated_by, reason, created_at, updated_at)
      VALUES (${id}, ${CANONICAL_PILOT_UID}, ${feat}, true, 'system', 'system', 'P17 Canonical Pilot Allowlist', now(), now())
      ON CONFLICT (user_id, feature_key)
      DO UPDATE SET enabled = true, updated_at = now(), updated_by = 'system', reason = 'P17 Canonical Pilot Allowlist'
    `
  }

  // 3. Delete user_feature_access rows for all other UIDs
  console.log(`Removing user_feature_access rows for all UIDs except ${CANONICAL_PILOT_UID}...`)
  const deleted = await sql`
    DELETE FROM user_feature_access
    WHERE user_id != ${CANONICAL_PILOT_UID}
    RETURNING id, user_id, feature_key
  `
  console.log(`Deleted ${deleted.length} user_feature_access rows for non-canonical UIDs.`)

  // 4. Post-cleanup verification
  const postUniqueActiveUsers = (await sql`SELECT count(DISTINCT user_id)::int as c FROM user_feature_access WHERE enabled = true`)[0].c
  const postTotalActiveRows = (await sql`SELECT count(*)::int as c FROM user_feature_access WHERE enabled = true`)[0].c
  const postTotalRows = (await sql`SELECT count(*)::int as c FROM user_feature_access`)[0].c

  const canonicalRows = await sql`
    SELECT user_id, feature_key, enabled, reason, updated_at
    FROM user_feature_access
    WHERE user_id = ${CANONICAL_PILOT_UID}
    ORDER BY feature_key
  `

  const historicalGrants = await sql`
    SELECT count(*)::int as c FROM user_feature_access WHERE user_id = ${HISTORICAL_PILOT_UID} AND enabled = true
  `

  const verification = {
    distinctActiveUsers: postUniqueActiveUsers,
    totalActiveRows: postTotalActiveRows,
    totalRows: postTotalRows,
    canonicalUid: CANONICAL_PILOT_UID,
    canonicalActiveGrants: canonicalRows.length,
    canonicalFeatures: canonicalRows.map(r => r.feature_key),
    historicalPilotActiveGrants: historicalGrants[0].c,
  }

  console.log('\n--- POST-CLEANUP VERIFICATION ---')
  console.log(JSON.stringify(verification, null, 2))

  if (postUniqueActiveUsers !== 1 || postTotalActiveRows !== 7 || canonicalRows.length !== 7) {
    throw new Error(`Integrity invariant failed: expected 1 active user with 7 grants, got ${postUniqueActiveUsers} users and ${postTotalActiveRows} rows`)
  }

  console.log('\nSUCCESS: Pilot cohort restored to exactly one active pilot identity!')
}

runCleanup().catch(err => {
  console.error('Cleanup failed:', err)
  process.exit(1)
})
