/** Read-only: editorial role counts only (no UIDs printed). */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

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

const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
const roles = await sql`SELECT role::text AS role, count(*)::int AS c FROM users GROUP BY 1 ORDER BY 1`
const editorial = await sql`
  SELECT count(*)::int AS c FROM users
  WHERE role::text IN ('author','video_editor','editor','managing_editor','super_admin')`
console.log(JSON.stringify({ roles, editorialTrustedCount: editorial[0]?.c }, null, 2))
