/**
 * P18.4C — Explicit tiny draft migration pilot script.
 *
 * HARD RULES:
 * - IDs must be listed explicitly below (no cohort loop)
 * - MAX 5 (enforced in service)
 * - Default mode = dry-run
 * - Execute only with: EXECUTE_P18_4C=1
 *
 * Usage:
 *   npx tsx scripts/p18_4c_canonical_draft_pilot.mts
 *   EXECUTE_P18_4C=1 npx tsx scripts/p18_4c_canonical_draft_pilot.mts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

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

{
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  if (!existsSync(stubDir)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(resolve(stubDir, 'index.js'), 'module.exports = {};\n')
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
}

/** EXPLICIT hard-coded pilot IDs — never replace with a query over the whole cohort. */
const PILOT_FIRESTORE_IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

async function main() {
  const {
    MAX_PILOT_RECORDS,
    runCanonicalDraftMigrationPilot,
    snapshotNewsUniverseCounts,
  } = await import('../src/services/editorial/canonicalDraftMigrationPilot')
  const { planCanonicalMigrationDryRun } = await import(
    '../src/services/editorial/canonicalMigrationPlanner'
  )
  const { neon } = await import('@neondatabase/serverless')

  if (PILOT_FIRESTORE_IDS.length > MAX_PILOT_RECORDS) {
    throw new Error('Script ID list exceeds MAX_PILOT_RECORDS')
  }

  const mode = process.env.EXECUTE_P18_4C === '1' ? 'execute' : 'dry-run'
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const pre = await snapshotNewsUniverseCounts()
  const [likes] = await sql`SELECT count(*)::int AS c FROM article_likes`
  const [saves] = await sql`SELECT count(*)::int AS c FROM saved_articles`
  const [comments] = await sql`SELECT count(*)::int AS c FROM article_comments`
  const [seen] = await sql`SELECT count(*)::int AS c FROM user_content_impressions`
  const [raw] = await sql`SELECT count(*)::int AS c FROM raw_articles`.catch(() => [{ c: -1 }])

  const plans = []
  for (const id of PILOT_FIRESTORE_IDS) {
    plans.push(await planCanonicalMigrationDryRun(id))
  }

  const orphanCheck = await sql`
    SELECT published_news_id
    FROM news_clusters
    WHERE published_news_id = ANY(${[...PILOT_FIRESTORE_IDS]})
      AND NOT EXISTS (SELECT 1 FROM news n WHERE n.id = published_news_id)`

  const run = await runCanonicalDraftMigrationPilot({
    firestoreIds: [...PILOT_FIRESTORE_IDS],
    mode,
    stopOnUnexpected: true,
  })

  const post = await snapshotNewsUniverseCounts()
  const [likes2] = await sql`SELECT count(*)::int AS c FROM article_likes`
  const [saves2] = await sql`SELECT count(*)::int AS c FROM saved_articles`
  const [comments2] = await sql`SELECT count(*)::int AS c FROM article_comments`
  const [seen2] = await sql`SELECT count(*)::int AS c FROM user_content_impressions`

  // Idempotency probe (dry-run of same ids after execute)
  const idempotency =
    mode === 'execute'
      ? await runCanonicalDraftMigrationPilot({
          firestoreIds: [...PILOT_FIRESTORE_IDS],
          mode: 'execute',
          stopOnUnexpected: true,
        })
      : null

  const out = {
    mode,
    pre: {
      ...pre,
      social: { likes: likes.c, saves: saves.c, comments: comments.c },
      seen: seen.c,
      raw: raw?.c ?? null,
    },
    plans: plans.map((p) => ({
      firestoreId: p.firestoreId,
      migrationClass: p.migrationClass,
      targetPgId: p.targetPgId,
      blockers: p.blockers,
      publisher: p.publisherMapping,
      cluster: p.clusterMapping,
      slugImpact: p.slugImpact,
      social: p.socialIdentityImpact,
      seen: p.seenIdentityImpact,
      bodyChars: p.bodyEligibility.bodyChars,
      humanProven: p.human.proven,
      similarityState: 'SIMILARITY_NOT_EVALUATED',
    })),
    orphanPilotRefs: orphanCheck.map((r) => r.published_news_id),
    run,
    post: {
      ...post,
      social: { likes: likes2.c, saves: saves2.c, comments: comments2.c },
      seen: seen2.c,
    },
    idempotency: idempotency
      ? {
          alreadyMigratedCount: idempotency.alreadyMigratedCount,
          insertedCount: idempotency.insertedCount,
          outcomes: idempotency.results.map((r) => r.outcome),
        }
      : null,
  }

  writeFileSync(
    resolve(process.cwd(), 'scripts/_p18_4c_pilot_out.json'),
    JSON.stringify(out, null, 2)
  )
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
