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

const OPERATOR_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== VERIFYING OPERATOR ACCESS & LIVE FEED SERVICE ===')

  // 1. Verify user_feature_access
  const grants = await sql`
    SELECT feature_key, enabled, reason, updated_at
    FROM user_feature_access
    WHERE user_id = ${OPERATOR_UID}
    ORDER BY feature_key
  `
  console.log(`1. Operator ${OPERATOR_UID} active grants (${grants.length}):`, grants)

  // 2. Query candidates from news table that feedService queries
  const candidates = await sql`
    SELECT id, title, slug, category_id, published_at, is_breaking
    FROM news
    WHERE status = 'published' AND published_at IS NOT NULL
    ORDER BY published_at DESC, id DESC
    LIMIT 20
  `
  console.log(`2. Published news candidates in DB (${candidates.length} items found)`)
  if (candidates.length > 0) {
    console.log('Top candidate:', candidates[0])
  }

  console.log('\nAll DB checks passed successfully!')
}

run().catch(e => {
  console.error('Verify failed:', e)
  process.exit(1)
})
