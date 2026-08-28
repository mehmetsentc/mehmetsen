import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

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

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  const usersList = await sql`SELECT firebase_uid, email, display_name FROM users LIMIT 5`
  console.log('Target pilot user:', usersList)

  if (!usersList.length) {
    console.error('No user found in DB')
    process.exit(1)
  }

  const pilotUid = usersList[0].firebase_uid
  const features = [
    'USER_PROFILES',
    'SOCIAL_GRAPH',
    'SMART_FEED',
    'SMART_FEED_RANKING_V1',
    'COLD_START_V2',
    'SMART_FEED_VIDEO',
    'SMART_FEED_TELEMETRY',
  ]

  console.log(`Granting pilot features to user ${pilotUid} (${usersList[0].email})...`)

  for (const feat of features) {
    const id = `ufa_pilot_${feat.toLowerCase()}`
    await sql`
      INSERT INTO user_feature_access (id, user_id, feature_key, enabled, created_by, updated_by, reason)
      VALUES (${id}, ${pilotUid}, ${feat}, true, 'pilot-operator-init', 'pilot-operator-init', 'P14 consumer pilot allowlist')
      ON CONFLICT (user_id, feature_key)
      DO UPDATE SET enabled = true, updated_at = now(), reason = 'P14 consumer pilot allowlist'
    `
  }

  const grants = await sql`SELECT user_id, feature_key, enabled, reason FROM user_feature_access WHERE user_id = ${pilotUid}`
  console.log('Current grants for user:', grants)
}

main().catch(console.error)
