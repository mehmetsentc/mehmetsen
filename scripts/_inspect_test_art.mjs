import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  try {
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
  } catch (e) {}
}

loadEnvLocal()

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  const sql = neon(url)

  const rows = await sql`
    SELECT * FROM news WHERE id = 'test_art_01'
  `
  console.log('test_art_01 row:', rows)
}

run().catch(console.error)
