/** P18.4D read-only deep 8-gram check — 3 pilots only. */
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

const IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
]

function toks(s: string): string[] {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

function grams(tokens: string[], n = 8): Set<string> {
  const g = new Set<string>()
  for (let i = 0; i <= tokens.length - n; i++) g.add(tokens.slice(i, i + n).join(' '))
  return g
}

function inter(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n
}

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)
  const rows = await sql`SELECT id, source_url, content FROM news WHERE id = ANY(${IDS})`
  const out = []
  for (const r of rows) {
    const body = toks(String(r.content || ''))
    const res = await fetch(String(r.source_url), {
      headers: { 'User-Agent': 'NaHaberP184D/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    const html = await res.text()
    const page = toks(html)
    const bodySet = new Set(body)
    const win = Math.min(900, page.length)
    let best = { score: 0, start: 0 }
    for (let i = 0; i + win <= page.length; i += 40) {
      let score = 0
      for (let j = i; j < i + win; j++) if (bodySet.has(page[j]!)) score++
      if (score > best.score) best = { score, start: i }
    }
    const article = page.slice(best.start, best.start + win)
    const gB = grams(body, 8)
    const gA = grams(article, 8)
    const gP = grams(page, 8)
    const sharedA = inter(gB, gA)
    const sharedP = inter(gB, gP)
    out.push({
      id: r.id,
      host: new URL(String(r.source_url)).hostname,
      bodyTokens: body.length,
      body8gramInArticleWindow: gB.size ? Number((sharedA / gB.size).toFixed(3)) : 0,
      body8gramInFullPage: gB.size ? Number((sharedP / gB.size).toFixed(3)) : 0,
      shared8gramsArticle: sharedA,
      shared8gramsPage: sharedP,
      body8gramCount: gB.size,
      // consecutive long phrase risk: max run of shared tokens in article window
      maxSharedRun: (() => {
        let max = 0
        let cur = 0
        for (const t of article) {
          if (bodySet.has(t)) {
            cur++
            max = Math.max(max, cur)
          } else cur = 0
        }
        return max
      })(),
    })
  }

  // publisher profile HTTP
  const pubs = ['cumhuriyet', 'bogazgazetesi-com-tr', 'dunya']
  const pubHttp: Record<string, number> = {}
  for (const p of pubs) {
    const r = await fetch(`https://www.nahaber.com/publisher/${p}`, { redirect: 'manual' })
    pubHttp[p] = r.status
  }

  console.log(JSON.stringify({ deep: out, pubHttp }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
