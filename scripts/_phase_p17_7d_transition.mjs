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

// The 28 articles with HIGH_OVERLAP and unknown/unverified rights
const TARGET_28_IDS = [
  'wn7TDVNBOsaHWCELr5XS',
  '7Ek0kU6f1f75FKdgkGkq',
  '9K3iCNDXq88sspsWh9Kq',
  'fxWQ30zMD9OLlFIRmy8L',
  '6E5499uuBEZgVrY5W14p',
  'Uyqn0o6oE98Whb44xKLx',
  'KdnQtmqxFcIuwMANyD7B',
  'Y5AmDjFJ8KK8k5lioHNw',
  'Yx1QZdnVi6jLgZu941wz',
  'SBDr3GiQGeCSb9bIJUyV',
  'slFAPHzhrEEZVQ6u05Hc',
  'ieVZR7VlZ5LFio9osW84',
  'WhyfdiqXx34V0APmwhlw',
  'uWAGgqQIRNbZd80HRuJU',
  '7ntbGyQCwAYT255TS3Gn',
  '0mfGNNNuoYKjjkSInvpL',
  'RxQYTsjDt7FT2jkCv6XE',
  '2wVpPtCQBj8h9BotuIfP',
  'YjAVmmdEzYbplPLkkcor',
  'o0bAK5STcEH3DWL0QSKB',
  'fH2adNEHm9jqprqi3ai6',
  '8rfBttkS8hWuza4i6r7y',
  'Wzwt4hSc2qdGYgiRJeq7',
  'pk9KtxrGkh5y9HhRM1zI',
  'FS6T7WazJeEe0kjOHJ5T',
  '2DbrAwetkrwO76kQYgsF',
  'th5Lx6c2IP1oRLNwya8C',
  'NHA9ts3sNZ2gFBZ1Xpu6',
]

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  const sql = neon(url)

  console.log('=== P17.7D: CONTROLLED REVERSIBLE TRANSITION TO DRAFT (EDITORIAL HOLD) ===')

  // 1. Audit current status before update
  const beforeRows = await sql`
    SELECT id, title, status, category_id, published_at
    FROM news
    WHERE id = ANY(${TARGET_28_IDS})
  `
  console.log(`Found ${beforeRows.length} of 28 target rows in DB before update.`)

  // 2. Perform safe, reversible update to 'draft'
  const updateResult = await sql`
    UPDATE news
    SET status = 'draft',
        updated_at = NOW()
    WHERE id = ANY(${TARGET_28_IDS})
      AND status = 'published'
    RETURNING id, title, status
  `
  console.log(`Successfully transitioned ${updateResult.length} articles to status = 'draft' (Editorial Hold).`)

  // 3. Verify total published count
  const allPublished = await sql`
    SELECT id, title, status, published_at
    FROM news
    WHERE status = 'published'
  `
  console.log(`\n--- POST-TRANSITION INVENTORY ---`)
  console.log(`Published news count: ${allPublished.length}`)
  console.log('Published items:', allPublished.map(r => ({ id: r.id, title: r.title?.slice(0, 50), status: r.status })))

  // 4. Verify draft / editorial hold count
  const allDrafts = await sql`
    SELECT id, title, status
    FROM news
    WHERE status = 'draft'
  `
  console.log(`Draft (Editorial Hold) count: ${allDrafts.length}`)

  // 5. Verify archived count
  const allArchived = await sql`
    SELECT id, title, status
    FROM news
    WHERE status = 'archived'
  `
  console.log(`Archived count: ${allArchived.length}`)
}

run().catch(console.error)
