/** P18.4D.4 — READ-ONLY pre/post snapshot of pilot rights (no writes). */
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnvLocal()

const IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

const { neon } = await import('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
const [counts] = await sql`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE status='draft')::int AS draft,
         count(*) FILTER (WHERE status='published')::int AS published
  FROM news`
const rows = await sql`
  SELECT id, status::text AS status,
         rights_status::text AS rights_status,
         rights_basis::text AS rights_basis,
         (rights_decided_by IS NOT NULL) AS has_actor,
         rights_decided_at,
         editorial_blocker,
         length(coalesce(content,''))::int AS body_len,
         (source_url IS NOT NULL AND length(trim(source_url))>0) AS has_source,
         publication_authority::text AS publication_authority,
         source
  FROM news WHERE id = ANY(${[...IDS]}) ORDER BY id`
const out = { counts, rows, pilotPublished: rows.filter((r) => r.status === 'published').length }
writeFileSync(resolve('scripts/_p18_4d4_pre_snapshot.json'), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
if (out.pilotPublished > 0) process.exit(2)
