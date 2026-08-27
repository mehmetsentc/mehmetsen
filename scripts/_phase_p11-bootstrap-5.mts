/**
 * Phase P11 — 5-source publisher bootstrap dry-run / live (CMS auth required for API;
 * this script talks to DB directly for operator local dry-run review).
 *
 * Usage:
 *   npx tsx scripts/_phase_p11-bootstrap-5.mts              # dry-run
 *   npx tsx scripts/_phase_p11-bootstrap-5.mts --live       # create/link if safe
 *   npx tsx scripts/_phase_p11-bootstrap-5.mts --source-ids=id1,id2
 *
 * NO full news_sources backfill. Prefer explicit --source-ids.
 */
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
  const live = process.argv.includes('--live')
  const idsArg = process.argv.find((a) => a.startsWith('--source-ids='))
  const sourceIds = idsArg
    ? idsArg
        .slice('--source-ids='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  let ids = sourceIds
  if (!ids || ids.length === 0) {
    const rows = await sql`
      SELECT id, name, domain, base_url
      FROM news_sources
      ORDER BY created_at ASC NULLS LAST, id ASC
      LIMIT 5`
    ids = (rows as Array<{ id: string }>).map((r) => r.id)
    console.log(
      'SELECTED_SOURCES',
      (rows as Array<{ id: string; name: string; domain: string | null }>).map((r) => ({
        id: r.id,
        name: r.name,
        domain: r.domain,
      }))
    )
  }

  // Dynamic import after env so services see DATABASE_URL
  const { bootstrapPublishersFromNewsSources } = await import(
    '../src/services/publisher/publisherBootstrapService.ts'
  )

  const first = await bootstrapPublishersFromNewsSources({
    dryRun: !live,
    limit: ids.length,
    sourceIds: ids,
  })
  console.log('PASS_1', JSON.stringify(first, null, 2))

  const second = await bootstrapPublishersFromNewsSources({
    dryRun: !live,
    limit: ids.length,
    sourceIds: ids,
  })
  console.log('PASS_2_IDEMPOTENCY', {
    dryRun: second.dryRun,
    created: second.created,
    matched: second.matched,
    skipped: second.skipped,
    ambiguous: second.ambiguous,
    errors: second.errors,
    details: second.details.map((d) => ({ sourceId: d.sourceId, action: d.action })),
  })

  if (live) {
    const dupPubs = await sql`
      SELECT primary_domain, count(*)::int AS c
      FROM publishers
      WHERE primary_domain IS NOT NULL
      GROUP BY primary_domain
      HAVING count(*) > 1`
    const dupLinks = await sql`
      SELECT source_id, count(*)::int AS c
      FROM publisher_sources
      GROUP BY source_id
      HAVING count(*) > 1`
    console.log('DUP_PUBLISHER_DOMAINS', dupPubs)
    console.log('DUP_PUBLISHER_SOURCES', dupLinks)
  }

  console.log(
    live
      ? 'LIVE complete. Review PASS_1/2 + dup checks.'
      : 'DRY-RUN only. Review CREATE/LINK/SKIP/AMBIGUOUS/ERROR then re-run with --live if safe.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
