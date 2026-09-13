/**
 * Apply ONE Video Library SQL migration (0043, 0044, or 0045).
 *
 * Usage:
 *   npx tsx scripts/apply-video-library-migration.mts 0043
 *   npx tsx scripts/apply-video-library-migration.mts 0043 --apply
 *
 * Does not touch 0040/0042 history. No drizzle-kit migrate (avoids batching).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
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

const FILES: Record<string, string> = {
  '0043': 'src/db/migrations/0043_phase_video_library_v1a.sql',
  '0044': 'src/db/migrations/0044_phase_video_library_v1b.sql',
  '0045': 'src/db/migrations/0045_phase_video_library_v1c1.sql',
}

function refuseDestructive(sqlText: string) {
  const executable = sqlText
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toUpperCase()
  for (const bad of ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'DELETE FROM', 'DROP COLUMN']) {
    if (executable.includes(bad)) throw new Error(`REFUSING migration: contains ${bad}`)
  }
}

function statementsFrom(sqlText: string): string[] {
  return sqlText
    .split(/-->\s*statement-breakpoint/)
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim()
        .replace(/;+\s*$/, '')
    )
    .filter(Boolean)
}

async function main() {
  const id = process.argv.find((a) => FILES[a])
  const apply = process.argv.includes('--apply')
  if (!id) throw new Error('Usage: npx tsx scripts/apply-video-library-migration.mts 0043 [--apply]')

  const rel = FILES[id]
  const abs = resolve(process.cwd(), rel)
  const sqlText = readFileSync(abs, 'utf8')
  refuseDestructive(sqlText)
  const hash = createHash('sha256').update(sqlText).digest('hex')
  const statements = statementsFrom(sqlText)

  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const sql = neon(url)

  const ledgerBefore = await sql`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY id`
  const tablesBefore = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'video_library%'
    ORDER BY 1`
  const newsBefore = await sql`SELECT COUNT(*)::int AS c FROM news`
  const hashRow = ledgerBefore.find((r) => r.hash === hash)

  console.log(
    JSON.stringify(
      {
        file: rel,
        hash,
        statements: statements.length,
        apply,
        hashAlreadyRecorded: Boolean(hashRow),
        tablesBefore: tablesBefore.map((t) => t.table_name),
        newsBefore: newsBefore[0]?.c,
        lastLedger: ledgerBefore[ledgerBefore.length - 1],
        ledgerCount: ledgerBefore.length,
      },
      null,
      2
    )
  )

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute.')
    return
  }

  if (hashRow) {
    throw new Error(`STOP: hash already recorded as drizzle id=${hashRow.id}`)
  }

  for (const stmt of statements) {
    console.log('EXEC', stmt.slice(0, 140).replace(/\s+/g, ' '))
    await sql.query(stmt)
  }

  const maxId = await sql`SELECT COALESCE(MAX(id), 0)::int AS id FROM drizzle.__drizzle_migrations`
  const nextId = Number(maxId[0]?.id ?? 0) + 1
  await sql`
    INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
    VALUES (${nextId}, ${hash}, ${Date.now().toString()})`

  const tablesAfter = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'video_library%'
    ORDER BY 1`
  const newsAfter = await sql`SELECT COUNT(*)::int AS c FROM news`
  const ledgerAfter = await sql`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY id DESC
    LIMIT 5`
  const itemCount = await sql`
    SELECT COUNT(*)::int AS c FROM video_library_items`.catch(() => [{ c: null }])
  const jobCount = await sql`
    SELECT COUNT(*)::int AS c FROM video_library_jobs`.catch(() => [{ c: null }])

  console.log(
    JSON.stringify(
      {
        applied: id,
        drizzleId: nextId,
        hash,
        tablesAfter: tablesAfter.map((t) => t.table_name),
        newsAfter: newsAfter[0]?.c,
        newsDelta: Number(newsAfter[0]?.c) - Number(newsBefore[0]?.c),
        videoLibraryItems: itemCount[0]?.c,
        videoLibraryJobs: jobCount[0]?.c,
        ledgerTail: ledgerAfter,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
