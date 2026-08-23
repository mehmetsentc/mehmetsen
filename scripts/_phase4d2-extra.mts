/**
 * Phase 4D.2 extra Neon inventory queries.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
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
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL!)
  const out: Record<string, unknown> = {}

  const clusterColsRows = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'news_clusters'
    ORDER BY ordinal_position
  `
  const clusterCols = (clusterColsRows as { column_name: string }[]).map((r) => r.column_name)
  out.news_clusters_all_columns = clusterCols
  out.news_clusters_decision_cols = (clusterColsRows as { column_name: string; data_type: string }[]).filter(
    (r) =>
      /decid|editorial|title|headline|name|summary/i.test(r.column_name) ||
      [
        'created_at',
        'updated_at',
        'ai_eligibility',
        'auto_draft_status',
        'source_count',
        'published_news_id',
      ].includes(r.column_name),
  )

  const has = (c: string) => clusterCols.includes(c)
  out.column_checks = {
    editorial_decided_at: has('editorial_decided_at'),
    decided_at: has('decided_at'),
    updated_at: has('updated_at'),
    created_at: has('created_at'),
    title: has('title'),
    headline: has('headline'),
    canonical_title: has('canonical_title'),
  }

  const titleCol = has('title')
    ? 'title'
    : has('canonical_title')
      ? 'canonical_title'
      : has('headline')
        ? 'headline'
        : has('display_title')
          ? 'display_title'
          : null

  const decidedCol = has('editorial_decided_at')
    ? 'editorial_decided_at'
    : has('decided_at')
      ? 'decided_at'
      : null

  // Build SELECT list safely from known columns only
  const selectParts: string[] = ['id']
  if (titleCol) selectParts.push(`${titleCol} AS title`)
  selectParts.push('editorial_decision')
  if (decidedCol) selectParts.push(`${decidedCol} AS editorial_decided_at`)
  else if (has('updated_at')) selectParts.push('updated_at AS editorial_decided_at_fallback')
  for (const c of ['ai_eligibility', 'auto_draft_status', 'source_count', 'published_news_id', 'created_at', 'updated_at']) {
    if (has(c)) selectParts.push(c)
  }

  // neon tagged template doesn't allow dynamic identifiers easily — use neon query with unsafe for identifiers only
  const { neonConfig } = await import('@neondatabase/serverless')
  // Use raw query via fetch through neon's sql.query if available
  const q = `SELECT ${selectParts.join(', ')}
    FROM news_clusters
    WHERE editorial_decision = 'APPROVED_FOR_AI'
    ORDER BY ${has('updated_at') ? 'updated_at' : 'created_at'} DESC NULLS LAST`

  // @neondatabase/serverless neon() returns a function; for dynamic SQL use sql.query in newer API
  // Fallback: Function constructor avoided — use postgres via neon with array form
  const approved = await (sql as any).query(q)
  out.approved_for_ai_clusters = approved?.rows ?? approved

  const jobCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'crawler_ai_jobs'
      AND column_name IN ('id','cluster_id','status','created_at','mode')
    ORDER BY 1
  `
  out.ai_jobs_columns = jobCols
  const jobHasMode = (jobCols as { column_name: string }[]).some((r) => r.column_name === 'mode')
  if (jobHasMode) {
    out.ai_jobs = await sql`
      SELECT id, cluster_id, status, created_at, mode
      FROM crawler_ai_jobs
      ORDER BY created_at DESC
    `
  } else {
    out.ai_jobs = await sql`
      SELECT id, cluster_id, status, created_at
      FROM crawler_ai_jobs
      ORDER BY created_at DESC
    `
  }
  out.ai_jobs_count = Array.isArray(out.ai_jobs) ? out.ai_jobs.length : 0

  const ledgerCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'crawler_ai_cost_ledger'
    ORDER BY 1
  `
  out.ledger_all_columns = (ledgerCols as { column_name: string }[]).map((r) => r.column_name)

  out.ledger_last_20 = await sql`
    SELECT id, cluster_id, status, request_type, mode, reason, failure_code,
           actual_cost_usd, estimated_cost_usd, model, provider, timestamp AS created_at
    FROM crawler_ai_cost_ledger
    ORDER BY timestamp DESC
    LIMIT 20
  `

  const sumRows = await sql`
    SELECT coalesce(sum(actual_cost_usd),0)::float AS cumulative_actual_cost_usd
    FROM crawler_ai_cost_ledger
  `
  out.cumulative_actual_cost_usd = (sumRows as any)[0]?.cumulative_actual_cost_usd ?? 0

  const draftCount = await sql`
    SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'AI_DRAFT'
  `
  out.raw_ai_draft_count = (draftCount as any)[0]?.c ?? 0
  out.raw_ai_draft_latest_5 = await sql`
    SELECT id, cluster_id, editorial_status, created_at, title
    FROM raw_articles
    WHERE editorial_status = 'AI_DRAFT'
    ORDER BY created_at DESC
    LIMIT 5
  `

  const pubRaw = await sql`
    SELECT count(*)::int AS c FROM raw_articles WHERE editorial_status = 'PUBLISHED'
  `
  const pubClusters = await sql`
    SELECT count(*)::int AS c FROM news_clusters WHERE published_news_id IS NOT NULL
  `
  out.published = {
    raw_editorial_status_PUBLISHED: (pubRaw as any)[0]?.c ?? 0,
    clusters_with_published_news_id: (pubClusters as any)[0]?.c ?? 0,
  }

  out.timestamps = await sql`
    SELECT
      (SELECT max(discovered_at) FROM discovered_article_urls) AS latest_discovery,
      (SELECT max(fetched_at) FROM raw_articles) AS latest_extraction,
      (SELECT max(updated_at) FROM news_clusters) AS latest_cluster_update,
      (SELECT max(created_at) FROM news_clusters) AS latest_cluster_create
  `

  out.news_sources_by_status = await sql`
    SELECT status::text AS status, count(*)::int AS c
    FROM news_sources GROUP BY 1 ORDER BY 2 DESC
  `
  out.news_sources_health_score = await sql`
    SELECT
      min(health_score)::float AS min,
      avg(health_score)::float AS avg,
      max(health_score)::float AS max,
      count(*) FILTER (WHERE health_score IS NULL)::int AS null_count,
      count(*)::int AS total
    FROM news_sources
  `

  const outPath = resolve(process.cwd(), 'tmp-phase4d2-extra.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ ok: true, path: outPath, keys: Object.keys(out), titleCol, decidedCol }))
}

main().catch((e) => {
  console.error(String((e as any)?.message || e).slice(0, 400))
  process.exit(1)
})
