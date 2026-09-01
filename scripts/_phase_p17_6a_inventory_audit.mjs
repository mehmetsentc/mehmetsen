import { readFileSync, writeFileSync } from 'node:fs'
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

function initAdmin() {
  if (getApps().length === 0) {
    let projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
    let clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
    let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

    const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
    if (jsonRaw) {
      try {
        const parsed = JSON.parse(jsonRaw)
        projectId = parsed.project_id || projectId
        clientEmail = parsed.client_email || clientEmail
        privateKey = parsed.private_key || privateKey
      } catch (e) {}
    }

    if (projectId && clientEmail && privateKey) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
    } else {
      initializeApp()
    }
  }
}

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== PHASE P17.6A: INVENTORY & ISOLATION AUDIT ===')

  // A. Postgres published canonical count
  const pgPublishedRows = await sql`
    SELECT 
      n.id,
      n.title,
      n.summary,
      n.content,
      n.category_id,
      n.cover_image_url,
      n.thumbnail_url,
      n.published_at,
      n.created_at,
      n.updated_at,
      n.status,
      n.slug,
      nc.id as cluster_id,
      nc.canonical_title as cluster_title,
      nc.source_count as cluster_source_count,
      nc.importance_score as cluster_importance,
      nc.has_material_update,
      nc.material_update_reason,
      nc.editorial_decision,
      nc.editorial_decided_by,
      nc.editorial_decided_at,
      nc.approval_source,
      ns.name as primary_source_name,
      ns.domain as primary_source_domain,
      ra.id as primary_raw_article_id,
      ra.title as primary_raw_title,
      ra.article_body_text as primary_raw_body,
      ra.original_url as primary_raw_url,
      ra.editorial_status as raw_editorial_status,
      p.id as publisher_id,
      p.name as publisher_name,
      p.slug as publisher_slug
    FROM news n
    LEFT JOIN news_clusters nc ON nc.published_news_id = n.id
    LEFT JOIN news_sources ns ON ns.id = nc.primary_source_id
    LEFT JOIN publisher_sources ps ON ps.source_id = ns.id
    LEFT JOIN publishers p ON p.id = ps.publisher_id
    LEFT JOIN raw_articles ra ON ra.cluster_id = nc.id AND ra.source_id = nc.primary_source_id
    WHERE (n.status = 'published' OR lower(n.status::text) in ('published', 'active'))
      AND n.published_at IS NOT NULL
      AND n.published_at <= NOW()
    ORDER BY n.published_at DESC
  `

  console.log('A. Postgres published canonical count (raw rows):', pgPublishedRows.length)

  // Deduplicate on n.id in case raw_articles join produces multiples
  const pgCanonicalMap = new Map()
  for (const r of pgPublishedRows) {
    if (!pgCanonicalMap.has(r.id)) {
      pgCanonicalMap.set(r.id, r)
    }
  }
  const pgCanonicalList = Array.from(pgCanonicalMap.values())
  console.log('A. Deduplicated unique Postgres published canonical news:', pgCanonicalList.length)

  // B & C & D. Firestore news documents
  initAdmin()
  const fs = getFirestore()
  console.log('Fetching Firestore news documents...')
  const fsNewsSnap = await fs.collection('news').limit(300).get()
  console.log('Fetched Firestore news collection documents count:', fsNewsSnap.size)

  let fsPublishedLooking = 0
  let fsCanonicalWithPgIdentity = 0
  let fsLegacyOnly = 0
  const fsLegacyIds = []
  const fsCanonicalIds = []

  const pgIdSet = new Set(pgCanonicalList.map(n => n.id))

  fsNewsSnap.forEach(doc => {
    const d = doc.data()
    const isPub = d.status === 'published' || d.status === 'active' || d.isPublished === true
    if (isPub) {
      fsPublishedLooking++
      if (pgIdSet.has(doc.id)) {
        fsCanonicalWithPgIdentity++
        fsCanonicalIds.push(doc.id)
      } else {
        fsLegacyOnly++
        fsLegacyIds.push(doc.id)
      }
    }
  })

  console.log('B. Firestore published-looking document count:', fsPublishedLooking)
  console.log('C. Canonical Firestore docs with explicit PG identity/mirror:', fsCanonicalWithPgIdentity)
  console.log('D. Legacy-only Firestore docs:', fsLegacyOnly)

  // E. Final FeedCandidateService eligible count
  const finalFeedEligibleCount = pgCanonicalList.length
  console.log('E. Final FeedCandidateService eligible count:', finalFeedEligibleCount)

  // F. Intersection between final feed candidates and legacy-only Firestore docs
  const intersectionCount = pgCanonicalList.filter(n => fsLegacyIds.includes(n.id)).length
  console.log('F. Intersection between final feed candidates and legacy-only Firestore docs:', intersectionCount)

  const out = {
    counts: {
      pgPublishedCount: pgCanonicalList.length,
      fsTotalCount: fsNewsSnap.size,
      fsPublishedLooking,
      fsCanonicalWithPgIdentity,
      fsLegacyOnly,
      finalFeedEligibleCount,
      intersectionCount
    },
    pgArticles: pgCanonicalList,
    fsLegacySample: fsLegacyIds.slice(0, 10)
  }

  writeFileSync(resolve(process.cwd(), 'scripts/_phase_p17_6a_inventory_out.json'), JSON.stringify(out, null, 2))
  console.log('Wrote inventory data to scripts/_phase_p17_6a_inventory_out.json')
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
