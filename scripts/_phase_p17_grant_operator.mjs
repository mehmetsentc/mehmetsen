import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  try {
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
  } catch (e) {}
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
]

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== P17 CANONICAL PILOT ACCESS GRANT ===')
  console.log('Target Pilot UID:', CANONICAL_PILOT_UID)

  // 1. Check if canonical pilot exists in users table
  const existingUsers = await sql`
    SELECT firebase_uid, email, display_name, role FROM users WHERE firebase_uid = ${CANONICAL_PILOT_UID}
  `
  console.log('Existing pilot user in DB:', existingUsers)

  const hasOperator = existingUsers.some(u => u.firebase_uid === CANONICAL_PILOT_UID)
  if (!hasOperator) {
    console.log('Inserting canonical pilot user record into users table...')
    await sql`
      INSERT INTO users (firebase_uid, email, display_name, role, created_at, updated_at)
      VALUES (${CANONICAL_PILOT_UID}, 'operator@nahaber.com', 'Operator Pilot User', 'super_admin', now(), now())
      ON CONFLICT (firebase_uid) DO UPDATE SET updated_at = now()
    `
    console.log('Pilot user record created in users table.')
  }

  // 2. Grant 7 features for canonical pilot
  console.log(`Granting ${FEATURES.length} pilot features to ${CANONICAL_PILOT_UID}...`)
  for (const feat of FEATURES) {
    const id = `ufa_op_${feat.toLowerCase()}`
    await sql`
      INSERT INTO user_feature_access (id, user_id, feature_key, enabled, created_by, updated_by, reason, created_at, updated_at)
      VALUES (${id}, ${CANONICAL_PILOT_UID}, ${feat}, true, 'system', 'system', 'P17 Canonical Pilot Allowlist', now(), now())
      ON CONFLICT (user_id, feature_key)
      DO UPDATE SET enabled = true, updated_at = now(), updated_by = 'system', reason = 'P17 Canonical Pilot Allowlist'
    `
  }

  // 3. Query back and verify grants in DB
  const operatorGrants = await sql`
    SELECT user_id, feature_key, enabled, reason, updated_at
    FROM user_feature_access
    WHERE user_id = ${CANONICAL_PILOT_UID}
    ORDER BY feature_key
  `
  console.log('\nCanonical Pilot Grants in DB:', operatorGrants)

  const allUfa = await sql`
    SELECT user_id, count(*)::int as count
    FROM user_feature_access
    WHERE enabled = true
    GROUP BY user_id
  `
  console.log('\nAll Active User Feature Grants Summary:', allUfa)

  console.log('\nDB Migration/Grant complete!')
}

run().catch(e => {
  console.error('Run failed:', e)
  process.exit(1)
})
