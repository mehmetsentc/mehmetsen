/**
 * Phase 4C.2 — dump pack metrics from failed canary (no paid AI).
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
  const { getDb } = await import('../src/db')
  const { crawlerAiCanaryRuns, newsClusters, crawlerAiJobs } = await import('../src/db/schema')
  const { eq, sql } = await import('drizzle-orm')
  const db = getDb()
  const rows = await db
    .select()
    .from(crawlerAiCanaryRuns)
    .where(eq(crawlerAiCanaryRuns.id, 'cny_mt1jdlxr_fzut0l'))
    .limit(1)
  const r = rows[0]
  if (!r) {
    console.log('missing job')
    return
  }
  const pack = r.packSnapshot as {
    metrics?: unknown
    sources?: Array<{ role: string; sourceName: string; body: string }>
  } | null
  const wc = (t: string) => t.trim().split(/\s+/).filter(Boolean).length
  const sources = (pack?.sources || []).map((s) => ({
    role: s.role,
    name: s.sourceName,
    words: wc(s.body || ''),
    chars: (s.body || '').length,
  }))
  console.log(
    JSON.stringify(
      {
        packMetrics: pack?.metrics,
        sources,
        usableSourceWords: sources.reduce((a, s) => a + s.words, 0),
        draftBodyWords: wc(((r.draftSnapshot as { body?: string } | null)?.body) || ''),
      },
      null,
      2
    )
  )
  const approved = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(newsClusters)
    .where(eq(newsClusters.editorialDecision, 'APPROVED_FOR_AI'))
  const jobs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(crawlerAiJobs)
    .where(sql`${crawlerAiJobs.status} IN ('PENDING','RUNNING','RESERVED')`)
  const succeeded = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(crawlerAiCanaryRuns)
    .where(eq(crawlerAiCanaryRuns.state, 'SUCCEEDED'))
  console.log(
    JSON.stringify(
      {
        APPROVED_FOR_AI: approved[0]?.c,
        activeAiJobs: jobs[0]?.c,
        canarySucceeded: succeeded[0]?.c,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
