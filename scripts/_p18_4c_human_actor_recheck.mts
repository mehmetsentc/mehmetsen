/**
 * P18.4C — READ-ONLY human-actor recheck + pilot candidate discovery.
 * Prints counts only (no private UIDs). Writes candidate IDs to out json.
 *
 * Usage: npx tsx scripts/_p18_4c_human_actor_recheck.mts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import {
  TRUSTED_EDITORIAL_ROLES,
  classifyMigrationEligibility,
  evaluateProvenHumanActor,
  migrationEvidenceFromFirestoreDoc,
  type MigrationEligibilityClass,
} from '../src/services/editorial/canonicalMigrationEligibility'
import { isAutomationIdentity } from '../src/services/editorial/humanReviewGate'
import { isExactKnownAutomationUid } from '../src/services/editorial/publicationAuthority'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
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

function asTrimmed(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function main() {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
  const db = initFs()

  const trustedRows = await sql`
    SELECT firebase_uid AS uid
    FROM users
    WHERE role::text = ANY(${[...TRUSTED_EDITORIAL_ROLES]})`
  const trusted = new Set(trustedRows.map((r) => String(r.uid)))

  const pgLegacy = await sql`SELECT id, legacy_firestore_id AS fs_id, slug, status::text AS status FROM news WHERE legacy_firestore_id IS NOT NULL`
  const mirrorMap = new Map(
    pgLegacy.map((r) => [
      String(r.fs_id),
      {
        id: String(r.id),
        legacyFirestoreId: String(r.fs_id),
        slug: String(r.slug),
        status: String(r.status),
      },
    ])
  )
  const pgIdSet = new Set(
    (await sql`SELECT id FROM news`).map((r) => String(r.id))
  )

  const orphanRows = await sql`
    SELECT nc.published_news_id AS published_news_id
    FROM news_clusters nc
    WHERE nc.published_news_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM news n WHERE n.id = nc.published_news_id)`
  const orphanPublishedIds = new Set(orphanRows.map((r) => String(r.published_news_id)))

  const counts: Record<string, number> = {
    MIRROR_ALREADY_CANONICAL: 0,
    HUMAN_ACTOR_VERIFIED: 0,
    HUMAN_AUTHORITY_UNVERIFIED_ACTOR: 0,
    LEGACY_REVIEW_REQUIRED: 0,
    QUARANTINED: 0,
    INSUFFICIENT_EVIDENCE: 0,
    PROVEN_HUMAN: 0,
  }

  const humanEditor = {
    total: 0,
    positiveVerified: 0,
    nonAutomationOnly: 0,
    unknownActor: 0,
    automationActor: 0,
    missingActor: 0,
  }

  type Cand = {
    id: string
    slug: string | null
    publisherHint: string | null
    sourceUrl: string | null
    bodyChars: number
    isOrphanPublishedRef: boolean
    rightsStatus: string | null
  }
  const verifiedCandidates: Cand[] = []

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

      if ((evidence.publicationAuthority || '').toUpperCase() === 'HUMAN_EDITOR') {
        humanEditor.total += 1
        const human = evaluateProvenHumanActor(evidence, trusted)
        const actors = [evidence.approvedBy, evidence.publishedBy].filter(Boolean) as string[]
        if (!actors.length) humanEditor.missingActor += 1
        else if (actors.some((a) => isExactKnownAutomationUid(a) || isAutomationIdentity(a))) {
          humanEditor.automationActor += 1
        } else if (human.proven) {
          humanEditor.positiveVerified += 1
        } else if (human.nonAutomationActor && !human.actorInTrustedEditorialMap) {
          humanEditor.nonAutomationOnly += 1
          humanEditor.unknownActor += 1
        } else {
          humanEditor.unknownActor += 1
        }
      }

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

      const result = classifyMigrationEligibility({
        evidence,
        pgMirror,
        trustedEditorialActorUids: trusted,
      })
      counts[result.migrationClass] = (counts[result.migrationClass] || 0) + 1

      if (
        result.migrationClass === 'HUMAN_ACTOR_VERIFIED' &&
        result.body.meetsMinimum &&
        result.body.sourceUrlExists &&
        evidence.slug &&
        result.blockers.length === 0 &&
        (evidence.publisherId || evidence.ingestionSourceId || evidence.sourceId)
      ) {
        verifiedCandidates.push({
          id: doc.id,
          slug: evidence.slug,
          publisherHint: evidence.publisherId || evidence.ingestionSourceId || evidence.sourceId,
          sourceUrl: evidence.sourceUrl,
          bodyChars: result.body.bodyChars,
          isOrphanPublishedRef: orphanPublishedIds.has(doc.id),
          rightsStatus: evidence.rightsStatus,
        })
      }
    }
    lastDoc = snap.docs[snap.docs.length - 1]
    if (scanned % 5000 === 0) console.log(JSON.stringify({ scanned, humanEditor }))
    if (snap.size < PAGE) break
  }

  // Prefer non-orphan, diversify publisher hints
  const selected: Cand[] = []
  const usedPublishers = new Set<string>()
  const nonOrphan = verifiedCandidates.filter((c) => !c.isOrphanPublishedRef)
  const pool = [...nonOrphan, ...verifiedCandidates.filter((c) => c.isOrphanPublishedRef)]
  for (const c of pool) {
    if (selected.length >= 3) break
    const pub = c.publisherHint || 'unknown'
    if (selected.length < 3 && (!usedPublishers.has(pub) || selected.length >= 2)) {
      // Prefer diversity first pass
      if (!usedPublishers.has(pub) || selected.length === 0) {
        selected.push(c)
        usedPublishers.add(pub)
      }
    }
  }
  // Fill if diversity left us short
  for (const c of pool) {
    if (selected.length >= 3) break
    if (!selected.some((s) => s.id === c.id)) selected.push(c)
  }

  const out = {
    scanned,
    trustedEditorialUidCount: trusted.size,
    migrationClassCounts: counts,
    humanEditor,
    verifiedCandidateCount: verifiedCandidates.length,
    selectedPilotIds: selected.map((c) => c.id),
    selected: selected.map((c) => ({
      id: c.id,
      slug: c.slug,
      publisherHint: c.publisherHint,
      bodyChars: c.bodyChars,
      isOrphanPublishedRef: c.isOrphanPublishedRef,
      rightsStatus: c.rightsStatus,
      similarityState: 'SIMILARITY_NOT_EVALUATED',
      // sourceUrl omitted from console; kept truncated in file for dry-run
      sourceUrlHost: c.sourceUrl ? new URL(c.sourceUrl).hostname : null,
    })),
    orphanPublishedCount: orphanPublishedIds.size,
  }

  writeFileSync(
    resolve(process.cwd(), 'scripts/_p18_4c_human_actor_recheck_out.json'),
    JSON.stringify(out, null, 2)
  )
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
