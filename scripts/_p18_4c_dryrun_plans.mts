/**
 * P18.4C — READ-ONLY dry-run plans for explicit pilot IDs.
 * No inserts. No EXECUTE path.
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

const IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

async function main() {
  const { planCanonicalMigrationDryRun } = await import(
    '../src/services/editorial/canonicalMigrationPlanner'
  )
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const [pg] = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'draft')::int AS draft,
      count(*) FILTER (WHERE status = 'published')::int AS published
    FROM news`
  const [social] = await sql`
    SELECT
      (SELECT count(*)::int FROM article_likes) AS likes,
      (SELECT count(*)::int FROM saved_articles) AS saves,
      (SELECT count(*)::int FROM article_comments) AS comments,
      (SELECT count(*)::int FROM user_content_impressions) AS seen`

  const orphan = await sql`
    SELECT published_news_id::text AS id
    FROM news_clusters
    WHERE published_news_id = ANY(${[...IDS]})
      AND NOT EXISTS (SELECT 1 FROM news n WHERE n.id = published_news_id)`

  const plans = []
  for (const id of IDS) {
    const p = await planCanonicalMigrationDryRun(id)
    plans.push({
      firestoreId: p.firestoreId,
      migrationClass: p.migrationClass,
      targetPgId: p.targetPgId,
      blockers: p.blockers,
      publisherStatus: p.publisherMapping.status,
      publisherSlug: p.publisherMapping.publisherSlug,
      cluster: p.clusterMapping,
      slugImpact: p.slugImpact,
      social: p.socialIdentityImpact,
      seen: p.seenIdentityImpact,
      bodyChars: p.bodyEligibility.bodyChars,
      sourceUrlExists: p.bodyEligibility.sourceUrlExists,
      rightsStatus: p.bodyEligibility.rightsStatus,
      humanProven: p.human.proven,
      actorTrusted: p.human.actorInTrustedEditorialMap,
      writeCapability: p.writeCapability,
      executable: p.executable,
      similarityState: 'SIMILARITY_NOT_EVALUATED',
    })
  }

  const out = { pre: { pg, social }, orphanPilotRefs: orphan.map((r) => r.id), plans }
  writeFileSync(resolve(process.cwd(), 'scripts/_p18_4c_dryrun_plans_out.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
