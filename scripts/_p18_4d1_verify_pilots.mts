/** P18.4D.1 — verify pilots draft-only (read-only). */
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnvLocal()
const IDS = ['0ALMkrRCE3LQqubviNZh', '0SdmPVCnO8pVAbMENA9f', '0XYEJVwyi7oILuYKf91R']
const { neon } = await import('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
const [counts] = await sql`SELECT count(*)::int AS total,
  count(*) FILTER (WHERE status='draft')::int AS draft,
  count(*) FILTER (WHERE status='published')::int AS published FROM news`
const pilots = await sql`SELECT id, status::text AS status, slug, length(coalesce(content,''))::int AS body_len,
  source, migration_batch_id AS batch FROM news WHERE id = ANY(${IDS}) ORDER BY id`
const pub = pilots.filter((p) => p.status === 'published').length
console.log(JSON.stringify({ counts, pilots, pilotPublished: pub }, null, 2))
if (pub > 0) process.exit(2)
