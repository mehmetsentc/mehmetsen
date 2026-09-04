/**
 * P18.4B — READ-ONLY strict reclassification + orphan cluster audit + candidate plans.
 * No writes. No migration execution.
 *
 * Usage: npx tsx scripts/_p18_4b_strict_reclassify.mts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import {
  classifyMigrationEligibility,
  migrationEvidenceFromFirestoreDoc,
  type MigrationEligibilityClass,
} from '../src/services/editorial/canonicalMigrationEligibility'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}

loadEnvLocal()

function initFs() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!.trim(),
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!.trim(),
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n').trim(),
      }),
    })
  }
  return getFirestore()
}

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
  const db = initFs()

  const pgLegacy = await sql`SELECT id, legacy_firestore_id AS fs_id, slug, status::text AS status FROM news WHERE legacy_firestore_id IS NOT NULL`
  const mirrorMap = new Map(pgLegacy.map((r) => [String(r.fs_id), { id: String(r.id), legacyFirestoreId: String(r.fs_id), slug: String(r.slug), status: String(r.status) }]))
  const pgIdSet = new Set(pgLegacy.map((r) => String(r.id)))

  const orphanRows = await sql`
    SELECT nc.id AS cluster_id, nc.published_news_id AS published_news_id
    FROM news_clusters nc
    WHERE nc.published_news_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM news n WHERE n.id = nc.published_news_id)`

  // Classify orphan published_news_id values: look like FS ids if doc exists
  let orphanFsDocs = 0
  let orphanUnknown = 0
  for (const row of orphanRows.slice(0, 200)) {
    const pid = String(row.published_news_id)
    const snap = await db.collection('news').doc(pid).get()
    if (snap.exists) orphanFsDocs += 1
    else orphanUnknown += 1
  }
  const orphanSampled = Math.min(200, orphanRows.length)

  const counts: Record<MigrationEligibilityClass, number> = {
    MIRROR_ALREADY_CANONICAL: 0,
    PROVEN_HUMAN: 0,
    LEGACY_REVIEW_REQUIRED: 0,
    QUARANTINED: 0,
    INSUFFICIENT_EVIDENCE: 0,
  }

  let humanEditorAuthority = 0
  let provenHumanWithBody = 0
  let provenHumanPublisherHint = 0
  let provenHumanSlugOk = 0
  let provenHumanFullyEligible = 0
  const provenHumanBlockReasons: Record<string, number> = {}
  const strongCandidates: Array<Record<string, unknown>> = []

  const PAGE = 500
  let lastDoc: import('firebase-admin/firestore').QueryDocumentSnapshot | undefined
  let scanned = 0

  for (;;) {
    let q = db.collection('news').orderBy('__name__').limit(PAGE)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      scanned += 1
      const data = doc.data() as Record<string, unknown>
      const evidence = migrationEvidenceFromFirestoreDoc(doc.id, data)
      if ((evidence.publicationAuthority || '').toUpperCase() === 'HUMAN_EDITOR') humanEditorAuthority += 1

      const pgMirror =
        mirrorMap.get(doc.id) ||
        (pgIdSet.has(doc.id)
          ? {
              id: doc.id,
              legacyFirestoreId: mirrorMap.get(doc.id)?.legacyFirestoreId ?? doc.id,
              slug: String(data.slug || ''),
              status: 'published',
            }
          : null)

      const result = classifyMigrationEligibility({ evidence, pgMirror })
      counts[result.migrationClass] += 1

      if (result.migrationClass === 'PROVEN_HUMAN') {
        if (result.body.meetsMinimum) provenHumanWithBody += 1
        if (evidence.ingestionSourceId || evidence.sourceId || evidence.publisherId) provenHumanPublisherHint += 1
        if (evidence.slug) provenHumanSlugOk += 1
        if (result.body.meetsMinimum && evidence.slug && result.blockers.length === 0) {
          provenHumanFullyEligible += 1
          if (strongCandidates.length < 5) {
            strongCandidates.push({
              id: doc.id,
              slug: evidence.slug,
              migrationClass: result.migrationClass,
              bodyChars: result.body.bodyChars,
              approvedBy: evidence.approvedBy,
              sourceUrl: evidence.sourceUrl,
              publisherHint: evidence.publisherId || evidence.ingestionSourceId || evidence.sourceId,
            })
          }
        }
        for (const b of result.blockers) {
          provenHumanBlockReasons[b] = (provenHumanBlockReasons[b] || 0) + 1
        }
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1]
    if (scanned % 5000 === 0) console.log('scanned', scanned)
    if (snap.size < PAGE) break
  }

  // Re-check P18.4A proposed IDs
  const proposedIds = ['00RHkMeZPHr8wO9FTDmH', '00iN4SAvWlSWjllEN6HA', '00pGDFGDQCyoVcwB1JIs']
  const proposed: Record<string, unknown> = {}
  for (const id of proposedIds) {
    const snap = await db.collection('news').doc(id).get()
    if (!snap.exists) {
      proposed[id] = { missing: true }
      continue
    }
    const evidence = migrationEvidenceFromFirestoreDoc(id, snap.data() as Record<string, unknown>)
    const pgMirror = mirrorMap.get(id) ?? null
    proposed[id] = classifyMigrationEligibility({ evidence, pgMirror })
  }

  const out = {
    generatedAt: new Date().toISOString(),
    scanned,
    strictCounts: counts,
    humanEditorAuthority,
    provenHumanWithBody,
    provenHumanPublisherHint,
    provenHumanSlugOk,
    provenHumanFullyEligible,
    provenHumanBlockReasons,
    strongCandidates,
    proposedP184aRecheck: proposed,
    orphans: {
      total: orphanRows.length,
      sampled: orphanSampled,
      sampledFsDocExists: orphanFsDocs,
      sampledUnknown: orphanUnknown,
      note: 'Sampled first 200 orphan published_news_id values against Firestore news docs',
    },
    pg: {
      total: (await sql`SELECT count(*)::int AS c FROM news`)[0].c,
      published: (await sql`SELECT count(*)::int AS c FROM news WHERE status='published'`)[0].c,
      legacyMap: pgLegacy.length,
    },
  }

  const path = resolve(process.cwd(), 'scripts/_p18_4b_strict_reclassify_out.json')
  writeFileSync(path, JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ scanned, counts, humanEditorAuthority, provenHumanFullyEligible, orphans: out.orphans, proposedSummary: Object.fromEntries(Object.entries(proposed).map(([k, v]) => [k, (v as { migrationClass?: string }).migrationClass || v])) }, null, 2))
  console.log('wrote', path)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
