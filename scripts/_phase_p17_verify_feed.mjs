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
  { uid: 'wG8WTNlW38TILLvpDLsFmt8IMlg1', label: 'Canonical Operator Pilot' },
  { uid: 'ap3scBglLIVwflfZN4qL8PKrM1A3', label: 'Google Auth Pilot (mehmetsentc)' },
]

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== VERIFYING DUAL PILOT ACCESS & LIVE FEED DATABASE STATE ===')

  for (const pilot of PILOT_UIDS) {
    // 1. Verify user record
    const users = await sql`
      SELECT firebase_uid, email, display_name, role FROM users WHERE firebase_uid = ${pilot.uid}
    `
    console.log(`\n1. [${pilot.label}] (${pilot.uid}) user record:`, users)

    // 2. Verify user_feature_access
    const grants = await sql`
      SELECT feature_key, enabled, reason, updated_at
      FROM user_feature_access
      WHERE user_id = ${pilot.uid}
      ORDER BY feature_key
    `
    console.log(`2. [${pilot.label}] Active grants (${grants.length}/7):`, grants.map(g => `${g.feature_key}: ${g.enabled}`))
    if (grants.length !== 7 || !grants.every(g => g.enabled)) {
      throw new Error(`Pilot ${pilot.uid} is missing active grants!`)
    }
  }

  // 3. Query candidates from news table that feedService queries
  const candidates = await sql`
    SELECT id, title, slug, category_id, published_at, is_breaking
    FROM news
    WHERE status = 'published' AND published_at IS NOT NULL
    ORDER BY published_at DESC, id DESC
    LIMIT 20
  `
  console.log(`\n3. Published news candidates in DB (${candidates.length} items found)`)
  if (candidates.length > 0) {
    console.log('Top candidate sample:', {
      id: candidates[0].id,
      title: candidates[0].title,
      published_at: candidates[0].published_at,
    })
  }

  console.log('\nAll Dual-Pilot DB checks passed 100% successfully!')
}

run().catch(e => {
  console.error('Verify failed:', e)
  process.exit(1)
})
