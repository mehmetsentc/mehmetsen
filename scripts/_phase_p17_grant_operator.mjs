import { readFileSync } from 'node:fs'
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
]

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== P17 PILOT ACCESS GRANTS (CANONICAL + GOOGLE AUTH) ===')

  for (const pilot of PILOT_UIDS) {
    console.log(`\nProcessing Pilot UID: ${pilot.uid} (${pilot.name})...`)

    // 1. Check/ensure user in users table
    const existingUsers = await sql`
      SELECT firebase_uid, email, display_name, role FROM users WHERE firebase_uid = ${pilot.uid}
    `
    console.log(`Existing user record in DB:`, existingUsers)

    if (existingUsers.length === 0) {
      console.log(`Inserting user record into users table...`)
      await sql`
        INSERT INTO users (firebase_uid, email, display_name, role, created_at, updated_at)
        VALUES (${pilot.uid}, ${pilot.email}, ${pilot.name}, 'super_admin', now(), now())
        ON CONFLICT (firebase_uid) DO UPDATE SET updated_at = now()
      `
      console.log(`User record created for ${pilot.uid}.`)
    }

    // 2. Grant all 7 features
    console.log(`Granting ${FEATURES.length} features to ${pilot.uid}...`)
    for (const feat of FEATURES) {
      const id = `ufa_${pilot.tag}_${feat.toLowerCase()}`
      await sql`
        INSERT INTO user_feature_access (id, user_id, feature_key, enabled, created_by, updated_by, reason, created_at, updated_at)
        VALUES (${id}, ${pilot.uid}, ${feat}, true, 'system', 'system', 'P17 Pilot Dual-Allowlist', now(), now())
        ON CONFLICT (user_id, feature_key)
        DO UPDATE SET enabled = true, updated_at = now(), updated_by = 'system', reason = 'P17 Pilot Dual-Allowlist'
      `
    }

    // 3. Query back and verify
    const grants = await sql`
      SELECT user_id, feature_key, enabled, reason, updated_at
      FROM user_feature_access
      WHERE user_id = ${pilot.uid}
      ORDER BY feature_key
    `
    console.log(`Active Grants for ${pilot.uid}:`, grants.map(g => `${g.feature_key}: ${g.enabled}`))
  }

  const allUfa = await sql`
    SELECT user_id, count(*)::int as count
    FROM user_feature_access
    WHERE enabled = true
    GROUP BY user_id
  `
  console.log('\nAll Active User Feature Grants in Database:', allUfa)
}

run().catch(e => {
  console.error('Run failed:', e)
  process.exit(1)
})
