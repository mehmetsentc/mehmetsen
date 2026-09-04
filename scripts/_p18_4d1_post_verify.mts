/**
 * P18.4D.1 — post-rewrite similarity + fidelity + safety (read-only except no writes).
 */
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
const C2 = '0SdmPVCnO8pVAbMENA9f'

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
function inter(a: Set<string>, b: Set<string>) {
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n
}
function deepOverlap(bodyText: string, pageHtml: string) {
  const body = toks(bodyText)
  const page = toks(pageHtml)
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
  const sharedA = inter(gB, gA)
  let maxRun = 0
  let cur = 0
  for (const t of article) {
    if (bodySet.has(t)) {
      cur++
      maxRun = Math.max(maxRun, cur)
    } else cur = 0
  }
  return {
    body8gramInArticleWindow: gB.size ? Number((sharedA / gB.size).toFixed(3)) : 0,
    shared8gramsArticle: sharedA,
    body8gramCount: gB.size,
    maxSharedRun: maxRun,
  }
}

/** Extract likely proper nouns / numbers from text for fidelity check */
function extractAnchors(text: string): string[] {
  const anchors = new Set<string>()
  for (const m of text.matchAll(/\b(\d{1,4})\b/g)) anchors.add(m[1]!)
  for (const m of text.matchAll(
    /\b(Çanakkale|Gelibolu|Tarihe Saygı|Yelken|Dalış|Başkanlığı|Sualtı|Parkı)\b/gi
  )) {
    anchors.add(m[1]!.toLocaleLowerCase('tr-TR'))
  }
  return [...anchors]
}

async function main() {
  const { neon } = await import('@neondatabase/serverless')
  const {
    checkTextSimilarity,
    validatePublicationRights,
  } = await import('../src/services/editorial/editorialSimilarityGate')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  const snap = JSON.parse(
    readFileSync(resolve(process.cwd(), 'scripts/_p18_4d1_c2_original_snapshot.json'), 'utf8')
  ) as { content: string; sourceUrl: string; title: string }

  const [counts] = await sql`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE status='draft')::int AS draft,
    count(*) FILTER (WHERE status='published')::int AS published FROM news`

  const pilots = await sql`
    SELECT id, status::text AS status, slug, title, summary, content, source, source_url,
           legacy_firestore_id AS legacy, migration_batch_id AS batch,
           length(coalesce(content,''))::int AS body_len
    FROM news WHERE id = ANY(${[...IDS]}) ORDER BY id`

  const c2 = pilots.find((p) => p.id === C2)!
  const sourceUrl = String(c2.source_url || snap.sourceUrl)
  const srcRes = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'NaHaberP184D1/1.0' },
    signal: AbortSignal.timeout(15000),
  })
  const srcHtml = await srcRes.text()

  const beforeGate = checkTextSimilarity(snap.content, srcHtml)
  const afterGate = checkTextSimilarity(String(c2.content || ''), srcHtml)
  const beforeDeep = deepOverlap(snap.content, srcHtml)
  const afterDeep = deepOverlap(String(c2.content || ''), srcHtml)
  const afterRights = validatePublicationRights({
    canonicalText: String(c2.content || ''),
    rawSourceText: srcHtml,
    rightsStatus: null,
    rightsBasis: null,
  })

  const beforeAnchors = extractAnchors(snap.content)
  const afterAnchors = new Set(extractAnchors(String(c2.content || '')))
  const missingAnchors = beforeAnchors.filter((a) => !afterAnchors.has(a) && !String(c2.content).toLocaleLowerCase('tr-TR').includes(a))
  // numbers/names present check softer
  const fidelity = {
    beforeAnchorCount: beforeAnchors.length,
    afterAnchorCount: afterAnchors.size,
    missingCriticalHints: missingAnchors.slice(0, 20),
    stillMentionsCanakkale: /çanakkale/i.test(String(c2.content)),
    stillMentionsGelibolu: /gelibolu/i.test(String(c2.content)),
    stillMentionsDalis: /dalış|dalis/i.test(String(c2.content)),
    stillMentionsYelken: /yelken/i.test(String(c2.content)),
  }

  const [social] = await sql`SELECT
    (SELECT count(*)::int FROM article_likes) likes,
    (SELECT count(*)::int FROM saved_articles) saves,
    (SELECT count(*)::int FROM article_comments) comments,
    (SELECT count(*)::int FROM user_content_impressions) seen`
  const [c2Seen] = await sql`SELECT count(*)::int AS c FROM user_content_impressions WHERE article_id = ${C2}`

  const http: Record<string, number> = {}
  for (const p of pilots) {
    const r = await fetch(`https://www.nahaber.com/haber/${p.slug}`, { redirect: 'manual' })
    http[String(p.slug)] = r.status
  }
  const sm = await (await fetch('https://www.nahaber.com/news-sitemap.xml')).text()
  const sitemapHits = IDS.filter((id) => sm.includes(id)).length
  const feed = (await fetch('https://www.nahaber.com/feed-v2', { redirect: 'manual' })).status

  // Rights on PG news schema?
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='news' AND column_name ILIKE '%right%'`

  // Candidates 1/3 body unchanged vs P18.4D lengths
  const c1 = pilots.find((p) => p.id === IDS[0])!
  const c3 = pilots.find((p) => p.id === IDS[2])!

  const decisionC2 =
    afterDeep.body8gramInArticleWindow >= 0.25 || afterDeep.maxSharedRun >= 40
      ? 'NEEDS_EDITORIAL_REWRITE'
      : afterDeep.body8gramInArticleWindow >= 0.1 || afterDeep.maxSharedRun >= 20
        ? 'KEEP_DRAFT_PENDING'
        : !fidelity.stillMentionsCanakkale || !fidelity.stillMentionsDalis
          ? 'KEEP_DRAFT_PENDING'
          : 'READY_FOR_HUMAN_PUBLISH'

  const out = {
    counts,
    pilotPublished: pilots.filter((p) => p.status === 'published').length,
    pilots: pilots.map((p) => ({
      id: p.id,
      status: p.status,
      slug: p.slug,
      title: p.title,
      bodyLen: p.body_len,
      source: p.source,
      legacy: p.legacy,
      batch: p.batch,
    })),
    c2Similarity: {
      beforeGate: beforeGate.overlapCategory,
      beforeDeep: beforeDeep.body8gramInArticleWindow,
      beforeMaxRun: beforeDeep.maxSharedRun,
      afterGate: afterGate.overlapCategory,
      afterDeep: afterDeep.body8gramInArticleWindow,
      afterMaxRun: afterDeep.maxSharedRun,
      afterRightsAllowed: afterRights.allowed,
      afterRightsReason: afterRights.reason,
      decision: decisionC2,
    },
    fidelity,
    social,
    c2Seen: c2Seen.c,
    http,
    sitemapHits,
    feed,
    newsRightsColumns: cols.map((c) => c.column_name),
    rightsDecisionNote: {
      candidate1: 'NO human click performed; PG news has no rights columns; RIGHTS_CLEARED_BY_HUMAN not recorded',
      candidate3: 'NO human click performed; PG news has no rights columns; RIGHTS_CLEARED_BY_HUMAN not recorded',
      requiredHumanAction:
        'Human must explicitly clear rights in an editorial UI that can persist rightsStatus/rightsBasis for these PG drafts (schema currently lacks columns) OR approve publish later with documented basis. Do not invent CLEARED.',
    },
    unchanged: {
      c1BodyLen: c1.body_len,
      c3BodyLen: c3.body_len,
      expectedC1: 1904,
      expectedC3: 1801,
    },
  }
  writeFileSync(resolve(process.cwd(), 'scripts/_p18_4d1_post_verify_out.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
