/**
 * AI STYLE P1.3A — focused factual preview.
 * 7 NEW-style generations. Retry = 0. Same P1.3 evidence URLs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { SEED_AI_EDITORS } from '../src/lib/ai/editorial/seedEditors'
import { SEED_CITY_AI_EDITORS } from '../src/lib/ai/editorial/seedCityEditors'
import { composePreviewNewsPrompt } from '../src/lib/ai/editorial/previewCompose'
import { safetyCompare } from '../src/lib/ai/editorial/abSafety'
import { flagEvidenceMismatches } from '../src/lib/ai/editorial/evidenceGrounding'
import {
  DEEPSEEK_API_BASE,
  getDeepSeekApiKey,
  getDeepSeekModel,
} from '../src/lib/ai/deepseekClient'
import { parseDeepSeekUsage } from '../src/lib/ai/usage/parseUsage'
import { isManualEditorAiEnabled } from '../src/services/crawler/automatedAiPolicy'

const MAX_CALLS = 7
const OUT_DIR = '/tmp/nahaber-p1-3a'
const P13_DIR = '/tmp/nahaber-p1-3-ab'
const FOCUS = ['dunya', 'ekonomi', 'spor', 'magazin', 'teknoloji', 'canakkale', 'breaking'] as const
const ALLOWED_ENV_KEYS = new Set(['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'DEEPSEEK_NEWS_MODEL'])

function loadDeepSeekEnvSilently() {
  const candidates = [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '../../.env.local')]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const eq = line.indexOf('=')
      const key = line.slice(0, eq).trim()
      if (!ALLOWED_ENV_KEYS.has(key) || process.env[key]?.trim()) continue
      process.env[key] = line
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
    }
    break
  }
}

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

const FEEDS: Record<string, string[]> = {
  breaking: [
    'https://www.aa.com.tr/tr/rss/default?cat=guncel',
    'https://www.aa.com.tr/rss/ajansguncel.xml',
  ],
  turkiye: ['https://www.aa.com.tr/tr/rss/default?cat=gundem'],
  dunya: ['https://www.aa.com.tr/tr/rss/default?cat=dunya'],
  ekonomi: ['https://www.aa.com.tr/tr/rss/default?cat=ekonomi'],
  spor: ['https://www.aa.com.tr/tr/rss/default?cat=spor'],
  magazin: [
    'https://www.haberturk.com/rss/kategori/magazin.xml',
    'https://www.hurriyet.com.tr/rss/magazin',
  ],
  teknoloji: [
    'https://www.sozcu.com.tr/feeds-rss-category-bilim-teknoloji',
    'https://www.haberturk.com/rss/kategori/teknoloji.xml',
  ],
  canakkale: ['https://www.canakkaleolay.com/rss', 'https://www.canakkalehaber.com/rss'],
}

async function recoverBody(sourceUrl: string, category: string, fallback: string): Promise<{ body: string; recovered: string }> {
  for (const url of FEEDS[category] || []) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NaHaberP13APreview/1.0 (local factual repair; no publish)' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const hit = parseRssItems(xml).find((item) => item.link === sourceUrl || sourceUrl.includes(item.link) || item.link.includes(sourceUrl))
      if (hit?.body && hit.body.length >= 80) {
        return { body: hit.body.slice(0, 6000), recovered: 'rss' }
      }
    } catch {
      continue
    }
  }
  return { body: fallback, recovered: 'saved_preview' }
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
  evidence: {
    editorSlug: string
    sourceTitle: string
    sourceBody: string
    sourceUrl: string
    categoryId: string
    province?: string
  },
  callIndex: number
) {
  if (callIndex > MAX_CALLS) throw new Error('hard cap exceeded')
  const spec = specFor(evidence.editorSlug)
  const composed = composePreviewNewsPrompt({
    spec,
    arm: 'new',
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
  const source = `${evidence.sourceTitle}\n${evidence.sourceBody}`
  return {
    model,
    article,
    safety: safetyCompare({ source, generated: article }),
    grounding: flagEvidenceMismatches({ source, generated: article }),
    usage: parseDeepSeekUsage(payload.usage),
  }
}

async function main() {
  loadDeepSeekEnvSilently()
  if (process.env.CRAWLER_AI_DISPATCH_ENABLED === 'true') throw new Error('CRAWLER_AI_DISPATCH_ENABLED must stay false')
  if (process.env.LEGACY_DIRECT_AI_ENABLED === 'true') throw new Error('LEGACY_DIRECT_AI_ENABLED must stay false')
  if (process.env.MANUAL_EDITOR_AI_ENABLED !== 'true') {
    throw new Error('MANUAL_EDITOR_AI_ENABLED=true required for this local preview process')
  }
  process.env.AI_USAGE_TELEMETRY_ENABLED = 'false'
  if (!getDeepSeekApiKey()) throw new Error('DEEPSEEK_API_KEY missing')

  const pairs = JSON.parse(readFileSync(`${P13_DIR}/pairs.json`, 'utf8')) as {
    pairs: Array<{
      category: string
      editorSlug: string
      publisher: string
      sourceUrl: string
      sourceTitle: string
      sourceBodyPreview: string
      sourceBodySha: string
      A: { article: { title: string; spot: string; content: string } }
      B: { article: { title: string; spot: string; content: string } }
    }>
  }
  const mapping = JSON.parse(readFileSync(`${P13_DIR}/mapping.json`, 'utf8')) as {
    mapping: Record<string, { A: 'current' | 'new'; B: 'current' | 'new' }>
  }

  const deskCategoryId: Record<string, string> = {
    breaking: 'son-dakika',
    turkiye: 'gundem',
    dunya: 'dunya',
    ekonomi: 'ekonomi',
    spor: 'spor',
    magazin: 'magazin',
    teknoloji: 'teknoloji',
    canakkale: 'yerel-haber',
  }

  let calls = 0
  const rows = []
  for (const category of FOCUS) {
    const prev = pairs.pairs.find((p) => p.category === category)
    if (!prev) throw new Error(`missing P1.3 pair ${category}`)
    const recovered = await recoverBody(prev.sourceUrl, category, prev.sourceBodyPreview)
    const evidence = {
      editorSlug: prev.editorSlug,
      sourceTitle: prev.sourceTitle,
      sourceBody: recovered.body,
      sourceUrl: prev.sourceUrl,
      categoryId: deskCategoryId[category] || category,
      province: category === 'canakkale' ? 'Çanakkale' : undefined,
    }
    const map = mapping.mapping[category]
    const beforeArm = map.A === 'new' ? 'A' : 'B'
    const beforeArticle = prev[beforeArm].article
    const after = await generateOnce(evidence, ++calls)
    const beforeGrounding = flagEvidenceMismatches({
      source: `${evidence.sourceTitle}\n${evidence.sourceBody}`,
      generated: beforeArticle,
    })
    rows.push({
      category,
      editorSlug: prev.editorSlug,
      publisher: prev.publisher,
      sourceUrl: prev.sourceUrl,
      sourceTitle: prev.sourceTitle,
      recovered: recovered.recovered,
      sourceBodySha: createHash('sha256').update(evidence.sourceBody).digest('hex').slice(0, 16),
      previousSha: prev.sourceBodySha,
      before: { article: beforeArticle, grounding: beforeGrounding },
      after: {
        article: after.article,
        grounding: after.grounding,
        safety: after.safety,
        model: after.model,
        usage: after.usage,
      },
    })
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(`${OUT_DIR}/repair.json`, JSON.stringify({ calls, rows }, null, 2))
  console.log(
    JSON.stringify({
      ok: true,
      calls,
      outDir: OUT_DIR,
      categories: rows.map((r) => r.category),
      remainingFlags: rows.map((r) => ({ category: r.category, flags: r.after.grounding.reviewFlags })),
    })
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
