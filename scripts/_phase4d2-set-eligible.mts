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
const id = process.argv[2]
const { neon } = await import('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL!)
const rows = await sql`
  UPDATE news_clusters
  SET ai_eligibility = 'ELIGIBLE', updated_at = now()
  WHERE id = ${id}
    AND editorial_decision = 'APPROVED_FOR_AI'
  RETURNING id, ai_eligibility, editorial_decision, editorial_decided_at, canonical_title AS title`
writeFileSync('tmp-phase4d2-eligible.json', JSON.stringify({ rows }, null, 2))
console.log(JSON.stringify({ ok: true, n: rows.length, elig: rows[0]?.ai_eligibility }))
