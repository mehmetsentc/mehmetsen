/**
 * CAT-1B guarded categories-only migration.
 *
 * Usage:
 *   npx tsx scripts/apply-cat-1b-categories-guarded.mts
 *   npx tsx scripts/apply-cat-1b-categories-guarded.mts --apply
 *
 * Default is DRY-RUN (SELECT + classify only). --apply is required to mutate.
 * All mutations run in one sql.transaction(...) and write ONLY to categories.
 *
 * DO NOT invoke --apply unless explicitly authorized.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'
import {
  CAT1B_TARGET_IDS,
  CAT1B_TARGETS,
  assertPostconditions,
  classifyCat1b,
  mutationWriteTables,
  type CategoryMutation,
  type CategoryRow,
} from '../src/services/category/cat1bGuardedMigration'

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

function mapRow(r: Record<string, unknown>): CategoryRow {
  return {
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    parent_id: r.parent_id == null ? null : String(r.parent_id),
    icon_name: r.icon_name == null ? null : String(r.icon_name),
    color: r.color == null ? null : String(r.color),
    is_standalone: Boolean(r.is_standalone),
  }
}

async function loadTargetRows(sql: ReturnType<typeof neon>): Promise<CategoryRow[]> {
  const ids = [...CAT1B_TARGET_IDS]
  const slugs = CAT1B_TARGET_IDS.map((id) => CAT1B_TARGETS[id as keyof typeof CAT1B_TARGETS].slug)
  const rows = await sql`
    SELECT id, name, slug, parent_id, icon_name, color, is_standalone
    FROM categories
    WHERE id = ANY(${ids}) OR slug = ANY(${slugs})
  `
  return (rows as Record<string, unknown>[]).map(mapRow)
}

async function observeRefs(sql: ReturnType<typeof neon>) {
  const ids = [...CAT1B_TARGET_IDS]
  const news = await sql`
    SELECT category_id, COUNT(*)::int AS n
    FROM news
    WHERE category_id = ANY(${ids})
    GROUP BY category_id
    ORDER BY category_id
  `
  const junction = await sql`
    SELECT category_id, COUNT(*)::int AS n
    FROM news_categories
    WHERE category_id = ANY(${ids})
    GROUP BY category_id
    ORDER BY category_id
  `
  return { news, news_categories: junction, note: 'observed only — not an equality gate' }
}

function buildTransaction(txn: ReturnType<typeof neon>, mutations: CategoryMutation[]) {
  if (mutationWriteTables(mutations).some((t) => t !== 'categories')) {
    throw new Error('REFUSING: mutation write scope is not categories-only')
  }
  const stmts = []
  for (const mutation of mutations) {
    if (mutation.kind === 'insert') {
      const r = mutation.row
      stmts.push(
        txn`
          INSERT INTO categories (id, name, slug, parent_id, icon_name, color, is_standalone)
          VALUES (
            ${r.id}, ${r.name}, ${r.slug}, ${r.parent_id},
            ${r.icon_name}, ${r.color}, ${r.is_standalone}
          )`
      )
      stmts.push(assertExactRow(txn, r))
    } else {
      const old = mutation.expectedOld
      const next = mutation.target
      stmts.push(
        txn`
          UPDATE categories
          SET
            name = ${next.name},
            slug = ${next.slug},
            parent_id = ${next.parent_id},
            icon_name = ${next.icon_name},
            color = ${next.color},
            is_standalone = ${next.is_standalone}
          WHERE id = ${old.id}
            AND name = ${old.name}
            AND slug = ${old.slug}
            AND parent_id IS NOT DISTINCT FROM ${old.parent_id}
            AND icon_name IS NOT DISTINCT FROM ${old.icon_name}
            AND color IS NOT DISTINCT FROM ${old.color}
            AND is_standalone = ${old.is_standalone}`
      )
      stmts.push(assertExactRow(txn, next))
    }
  }
  for (const id of CAT1B_TARGET_IDS) {
    stmts.push(assertExactRow(txn, CAT1B_TARGETS[id as keyof typeof CAT1B_TARGETS]))
  }
  return stmts
}

function assertExactRow(txn: ReturnType<typeof neon>, t: CategoryRow) {
  return txn`
    SELECT 1 / CASE
      WHEN (
        SELECT COUNT(*)::int
        FROM categories
        WHERE id = ${t.id}
          AND name = ${t.name}
          AND slug = ${t.slug}
          AND parent_id IS NOT DISTINCT FROM ${t.parent_id}
          AND icon_name IS NOT DISTINCT FROM ${t.icon_name}
          AND color IS NOT DISTINCT FROM ${t.color}
          AND is_standalone = ${t.is_standalone}
      ) = 1 THEN 1
      ELSE 0
    END AS cat1b_assert`
}

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.log(JSON.stringify({ error: 'DATABASE_URL_missing' }))
    process.exit(2)
  }
  const sql = neon(url)
  const rows = await loadTargetRows(sql)
  const refs = await observeRefs(sql)
  const plan = classifyCat1b(rows)

  const report = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    ok: plan.ok,
    blocked: plan.blocked,
    DRY_RUN_RESULT: plan.blocked ? 'BLOCKED' : 'READY',
    classifications: plan.classifications,
    steps: plan.steps.map((s) => `${s.id} ${s.classification} → ${s.action}`),
    blockers: plan.blockers,
    planned_mutations: plan.mutations.map((m) =>
      m.kind === 'insert' ? { kind: m.kind, table: m.table, id: m.row.id } : { kind: m.kind, table: m.table, id: m.id }
    ),
    write_tables: mutationWriteTables(plan.mutations),
    reference_counts_observed: refs,
    current_rows: rows,
  }
  console.log(JSON.stringify(report, null, 2))

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute the categories-only transaction.')
    return
  }

  if (!plan.ok) {
    console.log(JSON.stringify({ status: 'APPLY_REFUSED', reason: 'UNEXPECTED_OR_BLOCKED' }))
    process.exit(2)
  }

  if (plan.mutations.length === 0) {
    const post = assertPostconditions(rows)
    console.log(JSON.stringify({ status: 'NO_OP_SUCCESS', postcondition_errors: post }))
    if (post.length) process.exit(2)
    return
  }

  await sql.transaction((txn) => buildTransaction(txn as unknown as ReturnType<typeof neon>, plan.mutations))

  const after = await loadTargetRows(sql)
  const post = assertPostconditions(after)
  console.log(
    JSON.stringify({
      status: post.length ? 'APPLY_POSTCONDITION_FAILED' : 'APPLY_SUCCESS',
      postcondition_errors: post,
      after_rows: after,
    })
  )
  if (post.length) process.exit(2)
}

main().catch((e) => {
  console.log(JSON.stringify({ error: String((e as Error)?.message || e) }))
  process.exit(1)
})
