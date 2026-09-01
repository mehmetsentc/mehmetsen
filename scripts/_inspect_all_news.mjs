import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  const sql = neon(url)

  const rows = await sql`
    SELECT id, title, status, is_breaking, is_featured, published_at, created_at, category_id, views_count
    FROM news
    ORDER BY published_at DESC NULLS LAST
  `
  console.log(`Postgres news count: ${rows.length}`)
  console.log(rows.map(r => ({ id: r.id, title: r.title?.slice(0, 40), status: r.status, pub: r.published_at })))

  // Also check Firestore for test_art_01 or test items
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  let projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  let clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw)
      projectId = parsed.project_id || projectId
      clientEmail = parsed.client_email || clientEmail
      privateKey = parsed.private_key || privateKey
    } catch (e) {}
  }

  if (getApps().length === 0 && projectId && clientEmail && privateKey) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  }

  const fs = getFirestore()
  const docSnap = await fs.collection('news').doc('test_art_01').get()
  console.log('Firestore test_art_01 exists:', docSnap.exists, docSnap.data())

  const testTitleQuery = await fs.collection('news').where('title', '>=', 'Test').where('title', '<=', 'Test\uf8ff').get()
  console.log(`Firestore docs starting with 'Test': ${testTitleQuery.size}`)
  testTitleQuery.forEach(d => console.log('Firestore test doc:', d.id, d.data().title, d.data().status))
}

run().catch(console.error)
