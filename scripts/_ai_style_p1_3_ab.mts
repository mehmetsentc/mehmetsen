/**
 * AI STYLE P1.3 — bounded local A/B preview.
 *
 * 8 CURRENT + 8 NEW = 16 DeepSeek generations. Retry = 0.
 * No Firestore prompt writes. No news publish. No crawler AI.
 *
 * Usage (from this worktree, with host network):
 *   set -a && source /Users/user/nahaber/.env.local && set +a
 *   MANUAL_EDITOR_AI_ENABLED=true \
 *   CRAWLER_AI_DISPATCH_ENABLED=false \
 *   LEGACY_DIRECT_AI_ENABLED=false \
 *   AI_USAGE_TELEMETRY_ENABLED=false \
 *   npx tsx scripts/_ai_style_p1_3_ab.mts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash, randomInt } from 'node:crypto'
import { SEED_AI_EDITORS } from '../src/lib/ai/editorial/seedEditors'
import { SEED_CITY_AI_EDITORS } from '../src/lib/ai/editorial/seedCityEditors'
import { composePreviewNewsPrompt } from '../src/lib/ai/editorial/previewCompose'
import { safetyCompare } from '../src/lib/ai/editorial/abSafety'
import {
  DEEPSEEK_API_BASE,
  getDeepSeekApiKey,
  getDeepSeekModel,
} from '../src/lib/ai/deepseekClient'
import { parseDeepSeekUsage } from '../src/lib/ai/usage/parseUsage'
import { isManualEditorAiEnabled } from '../src/services/crawler/automatedAiPolicy'

const MAX_CALLS = 16
const OUT_DIR = '/tmp/nahaber-p1-3-ab'

type CategoryId =
  | 'breaking'
  | 'turkiye'
  | 'dunya'
  | 'ekonomi'
  | 'spor'
  | 'magazin'
  | 'teknoloji'
  | 'canakkale'

type Evidence = {
  category: CategoryId
  editorSlug: string
  publisher: string
  sourceUrl: string
  sourceTitle: string
  sourceBody: string
  categoryId: string
  province?: string
}

const DESKS: Array<{
  category: CategoryId
  editorSlug: string
  categoryId: string
  feeds: Array<{ publisher: string; url: string }>
  province?: string
  mustMatch?: RegExp
}> = [
  {
    category: 'breaking',
    editorSlug: 'arda-sahin',
    categoryId: 'son-dakika',
    feeds: [
      { publisher: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/tr/rss/default?cat=guncel' },
      { publisher: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/rss/ajansguncel.xml' },
    ],
  },
  {
    category: 'turkiye',
    editorSlug: 'ece-yalin',
    categoryId: 'gundem',
    feeds: [{ publisher: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/tr/rss/default?cat=gundem' }],
  },
  {
    category: 'dunya',
    editorSlug: 'defne-aksoy',
    categoryId: 'dunya',
    feeds: [{ publisher: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/tr/rss/default?cat=dunya' }],
  },
  {
    category: 'ekonomi',
    editorSlug: 'kerem-aydin',
    categoryId: 'ekonomi',
    feeds: [{ publisher: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi' }],
  },
  {
    category: 'spor',
    editorSlug: 'deniz-erdem',
    categoryId: 'spor',
    feeds: [{ publisher: 'Anadolu Ajansı', url: 'https://www.aa.com.tr/tr/rss/default?cat=spor' }],
  },
  {
    category: 'magazin',
    editorSlug: 'melis-kaya',
    categoryId: 'magazin',
    feeds: [
      { publisher: 'Habertürk', url: 'https://www.haberturk.com/rss/kategori/magazin.xml' },
      { publisher: 'Hürriyet', url: 'https://www.hurriyet.com.tr/rss/magazin' },
      { publisher: 'Sabah', url: 'https://www.sabah.com.tr/rss/magazin.xml' },
    ],
  },
  {
    category: 'teknoloji',
    editorSlug: 'can-tunc',
    categoryId: 'teknoloji',
    feeds: [
      { publisher: 'Sözcü', url: 'https://www.sozcu.com.tr/feeds-rss-category-bilim-teknoloji' },
      { publisher: 'Habertürk', url: 'https://www.haberturk.com/rss/kategori/teknoloji.xml' },
      { publisher: 'ShiftDelete', url: 'https://shiftdelete.net/feed' },
    ],
  },
  {
    category: 'canakkale',
    editorSlug: 'yerel-canakkale',
    categoryId: 'yerel-haber',
    province: 'Çanakkale',
    mustMatch: /çanakkale|biga|gelibolu|lapseki|ezine|ayvacık|bozcaada|gökçeada/i,
    feeds: [
      { publisher: 'Çanakkale Olay', url: 'https://www.canakkaleolay.com/rss' },
      { publisher: 'Çanakkale Haber', url: 'https://www.canakkalehaber.com/rss' },
    ],
  },
]

function specFor(slug: string) {
  const spec =
    SEED_AI_EDITORS.find((s) => s.slug === slug) || SEED_CITY_AI_EDITORS.find((s) => s.slug === slug)
  if (!spec) throw new Error(`missing seed editor ${slug}`)
  return spec
}

function decode(xml: string): string {
  return xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRssItems(xml: string): Array<{ title: string; link: string; body: string }> {
  const blocks = xml.split(/<(?:item|entry)[\s>]/i).slice(1)
  const items: Array<{ title: string; link: string; body: string }> = []
  for (const block of blocks) {
    const title = decode((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
    const link =
      decode((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '') ||
      decode((block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '')
    const desc = decode(
      (block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i) ||
        block.match(/<content[^>]*>([\s\S]*?)<\/content>/i) ||
        block.match(/<description>([\s\S]*?)<\/description>/i) ||
        [])[1] || ''
    )
    if (title && link) items.push({ title, link, body: desc })
  }
  return items
}

async function fetchFeed(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NaHaberP13Preview/1.0 (local editorial A/B; no publish)' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

async function collectEvidence(): Promise<Evidence[]> {
  const used = new Set<string>()
  const out: Evidence[] = []
  for (const desk of DESKS) {
    let picked: Evidence | null = null
    for (const feed of desk.feeds) {
      const xml = await fetchFeed(feed.url)
      if (!xml) continue
      const items = parseRssItems(xml)
      const candidate = items.find((item) => {
        if (used.has(item.link)) return false
        if (`${item.title} ${item.body}`.trim().length < 80) return false
        if (desk.mustMatch && !desk.mustMatch.test(`${item.title} ${item.body} ${item.link}`)) {
          return false
        }
        return true
      })
      if (candidate) {
        picked = {
          category: desk.category,
          editorSlug: desk.editorSlug,
          publisher: feed.publisher,
          sourceUrl: candidate.link,
          sourceTitle: candidate.title,
          sourceBody: candidate.body.slice(0, 6000),
          categoryId: desk.categoryId,
          province: desk.province,
        }
        used.add(candidate.link)
        break
      }
    }
    if (!picked) throw new Error(`no provenance-safe RSS item for ${desk.category}`)
    out.push(picked)
  }
  return out
}

function parseArticle(raw: string): { title: string; spot: string; summary: string; content: string } {
  const data = JSON.parse(raw) as Record<string, unknown>
  const str = (k: string) => (typeof data[k] === 'string' ? String(data[k]).trim() : '')
  return {
    title: str('title'),
    spot: str('spot'),
    summary: str('summary'),
    content: str('content'),
  }
}

async function generateOnce(
  evidence: Evidence,
  arm: 'current' | 'new',
  callIndex: number
) {
  if (callIndex > MAX_CALLS) throw new Error('hard cap exceeded')
  const spec = specFor(evidence.editorSlug)
  const composed = composePreviewNewsPrompt({
    spec,
    arm,
    sourceTitle: evidence.sourceTitle,
    sourceBody: evidence.sourceBody,
    sourceUrl: evidence.sourceUrl,
    categoryId: evidence.categoryId,
    province: evidence.province,
  })
  if (!isManualEditorAiEnabled()) throw new Error('MANUAL_EDITOR_AI_ENABLED=false')
  const model = getDeepSeekModel()
  const apiKey = getDeepSeekApiKey()
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing')
  const res = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 3500,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: composed.system },
        { role: 'user', content: composed.user },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  })
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
    usage?: unknown
    error?: { message?: string }
  }
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`)
  if (payload.error?.message) throw new Error(payload.error.message)
  const raw = payload.choices?.[0]?.message?.content?.trim() || ''
  if (!raw) throw new Error('DeepSeek empty content — retry=0, stopping')
  const article = parseArticle(raw)
  const safety = safetyCompare({
    source: `${evidence.sourceTitle}\n${evidence.sourceBody}`,
    generated: article,
  })
  return { model, article, safety, usage: parseDeepSeekUsage(payload.usage), rawChars: raw.length }
}

async function main() {
  if (process.env.CRAWLER_AI_DISPATCH_ENABLED === 'true') {
    throw new Error('CRAWLER_AI_DISPATCH_ENABLED must stay false')
  }
  if (process.env.LEGACY_DIRECT_AI_ENABLED === 'true') {
    throw new Error('LEGACY_DIRECT_AI_ENABLED must stay false')
  }
  if (process.env.MANUAL_EDITOR_AI_ENABLED !== 'true') {
    throw new Error('MANUAL_EDITOR_AI_ENABLED=true required for this local preview process')
  }
  process.env.AI_USAGE_TELEMETRY_ENABLED = 'false'
  if (!getDeepSeekApiKey()) throw new Error('DEEPSEEK_API_KEY missing')

  const evidence = await collectEvidence()
  const mapping: Record<string, { A: 'current' | 'new'; B: 'current' | 'new' }> = {}
  for (const row of evidence) {
    const newIsA = randomInt(2) === 0
    mapping[row.category] = newIsA ? { A: 'new', B: 'current' } : { A: 'current', B: 'new' }
  }

  let calls = 0
  const pairs = []
  for (const row of evidence) {
    const map = mapping[row.category]!
    const a = await generateOnce(row, map.A, ++calls)
    const b = await generateOnce(row, map.B, ++calls)
    pairs.push({
      category: row.category,
      editorSlug: row.editorSlug,
      publisher: row.publisher,
      sourceUrl: row.sourceUrl,
      sourceTitle: row.sourceTitle,
      sourceBodyPreview: row.sourceBody.slice(0, 400),
      sourceBodySha: createHash('sha256').update(row.sourceBody).digest('hex').slice(0, 16),
      A: { article: a.article, safety: a.safety, model: a.model, usage: a.usage },
      B: { article: b.article, safety: b.safety, model: b.model, usage: b.usage },
    })
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(
    `${OUT_DIR}/mapping.json`,
    JSON.stringify({ generatedAt: Date.now(), calls, mapping }, null, 2)
  )
  writeFileSync(`${OUT_DIR}/pairs.json`, JSON.stringify({ calls, pairs }, null, 2))
  console.log(JSON.stringify({ ok: true, calls, outDir: OUT_DIR, categories: evidence.map((e) => e.category) }))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
