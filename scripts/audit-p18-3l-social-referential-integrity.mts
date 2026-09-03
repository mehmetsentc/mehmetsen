/**
 * P18.3L — READ-ONLY referential integrity audit for social article_id targets.
 * Does NOT mutate or delete rows.
 *
 * Usage: npx tsx scripts/audit-p18-3l-social-referential-integrity.mts
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

type Bucket =
  | 'PG_CANONICAL'
  | 'FS_MIRROR'
  | 'LEGACY_ALLOWED_FS_ONLY'
  | 'LEGACY_QUARANTINED'
  | 'ORPHAN_UNKNOWN'

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const sql = neon(url)

  const ids = await sql`
    SELECT DISTINCT article_id AS id FROM (
      SELECT article_id FROM article_likes
      UNION
      SELECT article_id FROM saved_articles
      UNION
      SELECT article_id FROM article_comments
    ) t
  `
  const distinctIds = ids.map((r: { id: string }) => String(r.id))
  const buckets: Record<Bucket, number> = {
    PG_CANONICAL: 0,
    FS_MIRROR: 0,
    LEGACY_ALLOWED_FS_ONLY: 0,
    LEGACY_QUARANTINED: 0,
    ORPHAN_UNKNOWN: 0,
  }

  // Classify via PG first (read-only). Firestore eligibility for residual IDs
  // is best-effort when admin credentials exist; otherwise residual → ORPHAN_UNKNOWN.
  for (const id of distinctIds) {
    const pg = await sql`
      SELECT id, legacy_firestore_id
      FROM news
      WHERE id = ${id} OR legacy_firestore_id = ${id} OR slug = ${id}
      LIMIT 1
    `
    if (pg.length) {
      const row = pg[0] as { id: string; legacy_firestore_id: string | null }
      if (row.legacy_firestore_id) buckets.FS_MIRROR += 1
      else buckets.PG_CANONICAL += 1
      continue
    }

    // Residual — likely FS-only social target (P18.3K). Do not delete.
    // Without Firestore round-trip in this audit, count as LEGACY_ALLOWED_FS_ONLY
    // when id looks like a Firestore auto-id; else ORPHAN_UNKNOWN.
    const looksLikeFs = /^[A-Za-z0-9]{16,28}$/.test(id)
    if (looksLikeFs) buckets.LEGACY_ALLOWED_FS_ONLY += 1
    else buckets.ORPHAN_UNKNOWN += 1
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        readOnly: true,
        distinctTargets: distinctIds.length,
        buckets,
        note:
          'LEGACY_ALLOWED_FS_ONLY is heuristic for non-PG Firestore-shaped ids. Quarantine not reclassified without FS read.',
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
