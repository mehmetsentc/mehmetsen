#!/usr/bin/env node
/**
 * Full source health audit: RSS + local portal sample + scrapers + custom endpoints.
 * Usage: node scripts/audit-all-sources.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT = resolve(ROOT, '.tmp-source-audit')
const CONCURRENCY = 15
const TIMEOUT = 10000

mkdirSync(OUT, { recursive: true })

function parseRss(text) {
  const out = []
  const re =
    /\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'\s*,\s*feedUrl:\s*'([^']+)'(?:[^}]*?alternateFeedUrls:\s*\[\s*([^\]]*?)\s*\])?[\s\S]*?maxItemsPerRun:\s*(\d+)\s*,\s*enabled:\s*(true|false)[\s\S]*?\}/g
  let m
  while ((m = re.exec(text))) {
    const [, id, label, feedUrl, altsRaw, maxItems, enabled] = m
    const alternates = (altsRaw ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter((s) => s.startsWith('http'))
    out.push({
      id,
      label,
      feedUrl,
      alternates,
      maxItems: Number(maxItems),
      enabled: enabled === 'true',
      kind: 'rss',
    })
  }
  return out
}

function categorize(src) {
  const id = src.id.toLowerCase()
  if (
    /sport|spor|soccer|f1-|uefa|transfermarkt|fanatik|fotomac|sporx|ajansspor|goal-|voleybol|basketbol|futbol|world-cup|dunya-kupasi/.test(
      id,
    )
  )
    return 'Spor'
  if (/kripto|coindesk|cointelegraph|kriptokoin|btchaber/.test(id)) return 'Kripto'
  if (/ekonomi|finans|borsa|bigpara|bloomberg|cnbc|dunya-ekonomi|ekonomim/.test(id))
    return 'Ekonomi/Finans'
  if (/magazin|variety|billboard|tmz|hollywood/.test(id)) return 'Magazin'
  if (
    /teknoloji|tech|verge|wired|arstechnica|venturebeat|mit-tech|shiftdelete|webtekno|donanimhaber|chip-tr|openai|google-blog|microsoft-blog|apple-newsroom|bilim/.test(
      id,
    )
  )
    return 'Teknoloji'
  if (/saglik|health|who-news|nih-news|lancet|cdc|medimagazin/.test(id)) return 'Sağlık'
  if (/siyaset|politika|politics/.test(id)) return 'Siyaset'
  if (/gastronomi|yemek|lezzet/.test(id)) return 'Gastronomi'
  if (/otomobil|arabalar|oto-com/.test(id)) return 'Otomobil'
  if (/kultur|seyahat|turizm|gezi|lonely/.test(id)) return 'Turizm/Gezi'
  if (/kibris|cyprus|kktc/.test(id)) return 'Kıbrıs'
  if (/yasam/.test(id)) return 'Yaşam'
  if (
    /world|dunya|reuters|ap-news|aljazeera|guardian|france24|bbc-|sky-news|dw-|nature|science-daily|sputnik|nyt|wapo/.test(
      id,
    )
  )
    return 'Dünya'
  if (/sondakika|son-dakika|breaking/.test(id)) return 'Son Dakika'
  if (id.startsWith('google-news-tr')) return 'Google News'
  return 'Gündem/Genel'
}

function parseLocalPortals(text) {
  const out = []
  const re = /\{\s*id:\s*'([^']+)'[\s\S]*?feedUrl:\s*'([^']+)'[\s\S]*?enabled:\s*(true|false)/g
  let m
  while ((m = re.exec(text))) {
    out.push({ id: m[1], feedUrl: m[2], enabled: m[3] === 'true', kind: 'local-portal' })
  }
  return out
}

function parseScrapers(text) {
  const out = []
  const blocks = text.split(/\n\s*\{\s*\n/)
  for (const block of blocks) {
    const id = block.match(/id:\s*'([^']+)'/)?.[1]
    if (!id || !id.startsWith('scraper-')) continue
    const label = block.match(/label:\s*'([^']+)'/)?.[1] ?? id
    const enabled = /enabled:\s*true/.test(block)
    const urlsRaw = block.match(/listUrls:\s*\[([^\]]+)\]/)?.[1] ?? ''
    const urls = [...urlsRaw.matchAll(/'(https?:[^']+)'/g)].map((x) => x[1])
    if (!urls.length) continue
    out.push({ id, label, enabled, feedUrl: urls[0], listUrls: urls, kind: 'scraper' })
  }
  return out
}

async function probe(url, timeoutMs, { allowHtml = false, allowJson = false } = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; nahaber-source-audit/1.0; +https://nahaber.com)',
        Accept:
          'application/rss+xml, application/atom+xml, text/xml, application/xml, application/json, text/html, */*',
      },
      redirect: 'follow',
    })
    const elapsed = Date.now() - start
    const text = await res.text()
    const length = text.length
    if (!res.ok) return { ok: false, status: res.status, elapsed, reason: `HTTP ${res.status}`, length }

    if (allowJson) {
      try {
        JSON.parse(text)
        return { ok: true, status: res.status, elapsed, reason: `json ${length}b`, length }
      } catch {
        if (length > 20) return { ok: true, status: res.status, elapsed, reason: `body ${length}b`, length }
        return { ok: false, status: res.status, elapsed, reason: `empty json (${length}b)`, length }
      }
    }

    const hasItems = /<item\b|<entry\b|<haber\b/i.test(text)
    const isHtml = /<html[\s>]/i.test(text) || /<!DOCTYPE html/i.test(text)
    if (length < 200 && !allowHtml) {
      return { ok: false, status: res.status, elapsed, reason: `empty (${length}b)`, length }
    }
    if (hasItems) {
      const itemCount =
        (text.match(/<item\b/gi) || []).length ||
        (text.match(/<entry\b/gi) || []).length ||
        (text.match(/<haber\b/gi) || []).length
      return { ok: true, status: res.status, elapsed, reason: `${itemCount} items`, length, itemCount }
    }
    if (allowHtml && isHtml && length > 800) {
      return {
        ok: true,
        status: res.status,
        elapsed,
        reason: `html ${Math.round(length / 1024)}kb`,
        length,
        html: true,
      }
    }
    if (allowHtml && length > 800) {
      return { ok: true, status: res.status, elapsed, reason: `page ${Math.round(length / 1024)}kb`, length }
    }
    return { ok: false, status: res.status, elapsed, reason: 'no feed items', length }
  } catch (e) {
    return {
      ok: false,
      elapsed: Date.now() - start,
      reason: e.name === 'AbortError' ? 'timeout' : (e.code ?? e.message ?? 'fetch error'),
    }
  } finally {
    clearTimeout(t)
  }
}

async function runPool(items, fn) {
  const results = []
  let i = 0
  let inflight = 0
  await new Promise((done) => {
    function next() {
      while (inflight < CONCURRENCY && i < items.length) {
        const item = items[i++]
        inflight++
        fn(item)
          .then((r) => results.push(r))
          .finally(() => {
            inflight--
            if (i >= items.length && inflight === 0) done()
            else next()
          })
      }
      if (items.length === 0) done()
    }
    next()
  })
  return results
}

function summarize(rows) {
  const ok = rows.filter((r) => r.ok).length
  const fail = rows.length - ok
  return {
    total: rows.length,
    ok,
    fail,
    rate: rows.length ? Math.round((ok / rows.length) * 100) : 0,
  }
}

const rss = parseRss(readFileSync(resolve(ROOT, 'src/services/rss/sources.ts'), 'utf8')).map(
  (s) => ({ ...s, category: categorize(s) }),
)
const portals = parseLocalPortals(
  readFileSync(resolve(ROOT, 'src/services/newsroom/sources/localSources.ts'), 'utf8'),
)
const scrapers = parseScrapers(
  readFileSync(resolve(ROOT, 'src/services/newsroom/sources/scraperSources.ts'), 'utf8'),
)

console.log(`RSS: ${rss.length} (${rss.filter((s) => s.enabled).length} aktif / ${rss.filter((s) => !s.enabled).length} kapalı)`)
console.log(`Portals: ${portals.length}`)
console.log(`Scrapers: ${scrapers.length}`)

const activeRss = rss.filter((s) => s.enabled)
console.log(`\nProbing ${activeRss.length} RSS...`)
const rssResults = await runPool(activeRss, async (src) => {
  let r = await probe(src.feedUrl, TIMEOUT)
  let usedAlt = false
  if (!r.ok && src.alternates?.length) {
    for (const alt of src.alternates) {
      const r2 = await probe(alt, TIMEOUT)
      if (r2.ok) {
        r = r2
        usedAlt = true
        break
      }
    }
  }
  process.stdout.write(r.ok ? '.' : 'x')
  return { ...src, ...r, usedAlt }
})
console.log('')

const enabledPortals = portals.filter((p) => p.enabled)
const disabledPortals = portals.filter((p) => !p.enabled)
const samplePortals = [
  ...disabledPortals,
  ...enabledPortals.filter((_, i) => i % 7 === 0).slice(0, 50),
]
console.log(`Probing ${samplePortals.length} local portals (sample)...`)
const portalResults = await runPool(samplePortals, async (src) => {
  const r = await probe(src.feedUrl, TIMEOUT)
  process.stdout.write(r.ok ? '.' : 'x')
  return { ...src, ...r, sample: true }
})
console.log('')

const activeScrapers = scrapers.filter((s) => s.enabled)
console.log(`Probing ${activeScrapers.length} scrapers...`)
const scraperResults = await runPool(activeScrapers, async (src) => {
  let best = null
  for (const url of src.listUrls) {
    const r = await probe(url, TIMEOUT, { allowHtml: true })
    if (!best || (r.ok && !best.ok) || (r.ok && best.ok && (r.length || 0) > (best.length || 0))) {
      best = { ...r, probedUrl: url }
    }
    if (r.ok) break
  }
  process.stdout.write(best?.ok ? '.' : 'x')
  return { ...src, ...best }
})
console.log('')

const custom = [
  {
    id: 'aa-gundem-page',
    label: 'AA Gündem HTML',
    feedUrl: 'https://www.aa.com.tr/tr/gundem',
    kind: 'custom',
    allowHtml: true,
  },
  {
    id: 'anka-sondakika',
    label: 'ANKA Son Dakika',
    feedUrl: 'https://ankahaber.net/kategori/sondakika',
    kind: 'custom',
    allowHtml: true,
  },
  {
    id: 'anka-yerel',
    label: 'ANKA Yerel',
    feedUrl: 'https://ankahaber.net/kategori/yerel-haberler',
    kind: 'custom',
    allowHtml: true,
  },
  {
    id: 'afad-deprem',
    label: 'AFAD Deprem API',
    feedUrl: 'https://deprem.afad.gov.tr/apiv2/event/filter?minmag=4&orderby=timedesc&limit=5',
    kind: 'custom',
    allowJson: true,
  },
  {
    id: 'hn-top',
    label: 'Hacker News Firebase',
    feedUrl: 'https://hacker-news.firebaseio.com/v0/topstories.json',
    kind: 'custom',
    allowJson: true,
  },
]

console.log(`Probing ${custom.length} custom...`)
const customResults = await runPool(custom, async (src) => {
  const r = await probe(src.feedUrl, TIMEOUT, {
    allowHtml: !!src.allowHtml,
    allowJson: !!src.allowJson,
  })
  process.stdout.write(r.ok ? '.' : 'x')
  return { ...src, ...r }
})
console.log('')

const report = {
  generatedAt: new Date().toISOString(),
  inventory: {
    rssTotal: rss.length,
    rssEnabled: rss.filter((s) => s.enabled).length,
    rssDisabled: rss.filter((s) => !s.enabled).length,
    portalsTotal: portals.length,
    portalsEnabled: portals.filter((p) => p.enabled).length,
    portalsDisabled: portals.filter((p) => !p.enabled).length,
    scrapersTotal: scrapers.length,
    scrapersEnabled: scrapers.filter((s) => s.enabled).length,
  },
  summaries: {
    rss: summarize(rssResults),
    portalsSample: summarize(portalResults),
    scrapers: summarize(scraperResults),
    custom: summarize(customResults),
  },
  rssByCategory: {},
  rssFailures: rssResults
    .filter((r) => !r.ok)
    .map((r) => ({
      id: r.id,
      label: r.label,
      category: r.category,
      reason: r.reason,
      url: r.feedUrl,
    })),
  rssOk: rssResults
    .filter((r) => r.ok)
    .map((r) => ({
      id: r.id,
      label: r.label,
      category: r.category,
      reason: r.reason,
      usedAlt: !!r.usedAlt,
      elapsed: r.elapsed,
      itemCount: r.itemCount ?? null,
    })),
  rssDisabled: rss
    .filter((s) => !s.enabled)
    .map((s) => ({ id: s.id, label: s.label, category: s.category, url: s.feedUrl })),
  portalFailures: portalResults
    .filter((r) => !r.ok)
    .map((r) => ({ id: r.id, reason: r.reason, url: r.feedUrl, enabled: r.enabled })),
  portalOk: portalResults.filter((r) => r.ok).map((r) => ({ id: r.id, reason: r.reason })),
  scraperFailures: scraperResults
    .filter((r) => !r.ok)
    .map((r) => ({ id: r.id, label: r.label, reason: r.reason, url: r.feedUrl })),
  scraperOk: scraperResults
    .filter((r) => r.ok)
    .map((r) => ({ id: r.id, label: r.label, reason: r.reason })),
  customResults: customResults.map((r) => ({
    id: r.id,
    label: r.label,
    ok: r.ok,
    reason: r.reason,
    url: r.feedUrl,
  })),
}

for (const r of rssResults) {
  const c = r.category
  if (!report.rssByCategory[c]) report.rssByCategory[c] = { ok: 0, fail: 0 }
  if (r.ok) report.rssByCategory[c].ok++
  else report.rssByCategory[c].fail++
}

writeFileSync(resolve(OUT, 'full-report.json'), JSON.stringify(report, null, 2))
writeFileSync(resolve(OUT, 'rss-all.json'), JSON.stringify(rssResults, null, 2))
writeFileSync(resolve(OUT, 'scrapers.json'), JSON.stringify(scraperResults, null, 2))
writeFileSync(resolve(OUT, 'portals-sample.json'), JSON.stringify(portalResults, null, 2))

console.log('\n=== SUMMARY ===')
console.log(JSON.stringify(report.summaries, null, 2))
console.log('\nRSS failures:', report.rssFailures.length)
for (const f of report.rssFailures) console.log(`  ${f.id}: ${f.reason}`)
console.log('\nPortal sample failures:', report.portalFailures.length)
for (const f of report.portalFailures) console.log(`  ${f.id}: ${f.reason}`)
console.log('\nScraper failures:', report.scraperFailures.length)
for (const f of report.scraperFailures) console.log(`  ${f.id}: ${f.reason}`)
console.log('\nCustom:')
for (const c of report.customResults) console.log(`  ${c.ok ? 'OK' : 'FAIL'} ${c.id}: ${c.reason}`)
console.log(`\nWrote ${OUT}/full-report.json`)
