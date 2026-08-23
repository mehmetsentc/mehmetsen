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
const HIST = [
  'cl_7ca7b0c4-8234-4e0f-bc98-f77582c48799',
  'cl_6b54e643-329f-406b-bf34-ad45aa9d3632',
  'cl_713c7834-a506-4c50-8d45-32109c988edd',
  'cl_7ec4422d-8100-49c1-b356-67aee791b82d',
]
const id = process.argv[2]
if (!id) throw new Error('id required')
if (HIST.includes(id)) throw new Error('historical')
const { neon } = await import('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL!)
const approved = await sql`
  UPDATE news_clusters
  SET editorial_decision = 'APPROVED_FOR_AI',
      editorial_decided_at = now(),
      editorial_decided_by = 'p4d2_accept',
      approval_source = 'operator',
      updated_at = now()
  WHERE id = ${id}
    AND editorial_decision = 'NONE'
    AND id <> ALL(${HIST})
  RETURNING id, canonical_title AS title, editorial_decision, editorial_decided_at,
            editorial_decided_by, approval_source, ai_eligibility, auto_draft_status,
            source_count, created_at, updated_at`
writeFileSync('tmp-phase4d2-approved.json', JSON.stringify({ approved, at: new Date().toISOString() }, null, 2))
console.log(JSON.stringify({ ok: true, n: approved.length, id: approved[0]?.id }))
