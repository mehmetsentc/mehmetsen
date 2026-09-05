/**
 * Apply P18 feed local location prefs (0042) once.
 * Usage:
 *   npx tsx scripts/apply-p18-feed-local-location-prefs.mts
 *   npx tsx scripts/apply-p18-feed-local-location-prefs.mts --apply
 *
 * Additive only: city_slug / district_slug / local_news_cleared_at.
 * No DROP / DELETE / TRUNCATE. Does not touch news, social, rights, finance.
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
  const apply = process.argv.includes('--apply')
  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL missing')
  const sql = neon(url)

  const sqlText = readFileSync(
    resolve(process.cwd(), 'src/db/migrations/0042_phase_feed_local_location_prefs.sql'),
    'utf8'
  )

  const executable = sqlText
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toUpperCase()
  for (const bad of ['DROP TABLE', 'TRUNCATE', 'DROP SCHEMA', 'DELETE FROM', 'INSERT INTO', 'UPDATE ']) {
    if (executable.includes(bad)) throw new Error(`REFUSING migration: contains ${bad}`)
  }

  const beforeCols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
      AND column_name IN ('city_slug', 'district_slug', 'local_news_cleared_at', 'city')
    ORDER BY 1`
  const beforeCount = await sql`SELECT COUNT(*)::int AS c FROM user_profiles`
  const pilotBefore = await sql`
    SELECT firebase_uid, city FROM user_profiles
    WHERE firebase_uid = 'wG8WTNlW38TILLvpDLsFmt8IMlg1' LIMIT 1`
  const newsBefore = await sql`SELECT COUNT(*)::int AS c FROM news`
  const grantsBefore = await sql`
    SELECT COUNT(*)::int AS c FROM user_feature_access
    WHERE user_id = 'wG8WTNlW38TILLvpDLsFmt8IMlg1' AND enabled = true`

  console.log('BEFORE_COLS', beforeCols)
  console.log('BEFORE_PROFILES', beforeCount[0])
  console.log('BEFORE_PILOT_PROFILE', pilotBefore)
  console.log('BEFORE_NEWS', newsBefore[0])
  console.log('BEFORE_PILOT_GRANTS', grantsBefore[0])

  const already =
    beforeCols.some((c) => c.column_name === 'city_slug') &&
    beforeCols.some((c) => c.column_name === 'district_slug') &&
    beforeCols.some((c) => c.column_name === 'local_news_cleared_at')

  if (already) {
    console.log('ALREADY_APPLIED — skipping execute (idempotent IF NOT EXISTS still safe)')
    if (!apply) {
      console.log('DRY_RUN only. Pass --apply to execute (no-op if columns exist).')
      return
    }
  }

  if (!apply) {
    console.log('DRY_RUN only. Pass --apply to execute.')
    return
  }

  const statements = sqlText
    .split(/-->\s*statement-breakpoint/)
    .flatMap((chunk) =>
      chunk
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.split('\n').every((l) => !l.trim() || l.trim().startsWith('--')))
    )
    .map((s) =>
      s
        .split('\n')
        .filter((l) => !l.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter(Boolean)

  for (const stmt of statements) {
    console.log('EXEC', stmt.slice(0, 120).replace(/\s+/g, ' '), '...')
    await sql.query(stmt)
  }

  // Record in drizzle history if table exists and 42 not present
  const has42 = await sql`
    SELECT id FROM drizzle.__drizzle_migrations WHERE id = 42 LIMIT 1`.catch(() => [])
  if (!has42.length) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at)
      VALUES (
        42,
        'p18_feed_local_location_prefs_0042',
        ${Date.now().toString()}
      )`.catch((e) => {
      console.log('DRIZZLE_HISTORY_SKIP', String(e))
    })
  }

  const afterCols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
      AND column_name IN ('city_slug', 'district_slug', 'local_news_cleared_at', 'city')
    ORDER BY 1`
  const afterCount = await sql`SELECT COUNT(*)::int AS c FROM user_profiles`
  const pilotAfter = await sql`
    SELECT firebase_uid, city, city_slug, district_slug, local_news_cleared_at
    FROM user_profiles
    WHERE firebase_uid = 'wG8WTNlW38TILLvpDLsFmt8IMlg1' LIMIT 1`.catch(async () => {
    return await sql`
      SELECT firebase_uid, city FROM user_profiles
      WHERE firebase_uid = 'wG8WTNlW38TILLvpDLsFmt8IMlg1' LIMIT 1`
  })
  const newsAfter = await sql`SELECT COUNT(*)::int AS c FROM news`
  const grantsAfter = await sql`
    SELECT COUNT(*)::int AS c FROM user_feature_access
    WHERE user_id = 'wG8WTNlW38TILLvpDLsFmt8IMlg1' AND enabled = true`

  console.log('AFTER_COLS', afterCols)
  console.log('AFTER_PROFILES', afterCount[0])
  console.log('AFTER_PILOT_PROFILE', pilotAfter)
  console.log('AFTER_NEWS', newsAfter[0])
  console.log('AFTER_PILOT_GRANTS', grantsAfter[0])

  const ok =
    afterCols.some((c) => c.column_name === 'city_slug') &&
    afterCols.some((c) => c.column_name === 'district_slug') &&
    afterCols.some((c) => c.column_name === 'local_news_cleared_at') &&
    afterCount[0]?.c === beforeCount[0]?.c &&
    newsAfter[0]?.c === newsBefore[0]?.c &&
    grantsAfter[0]?.c === grantsBefore[0]?.c

  if (!ok) {
    console.error('VERIFY_FAILED')
    process.exit(1)
  }
  console.log('VERIFY_OK')
}

main().catch((e) => {
  console.error(String(e))
  process.exit(1)
})
