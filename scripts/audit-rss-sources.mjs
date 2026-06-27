#!/usr/bin/env node
/**
 * Audit RSS sources: list every configured feed, optionally probe via HTTP HEAD/GET
 * to see which are reachable and returning content.
 *
 * Usage:
 *   node scripts/audit-rss-sources.mjs            # list only
 *   node scripts/audit-rss-sources.mjs --probe    # probe each feed (concurrency 12)
 *   node scripts/audit-rss-sources.mjs --probe --concurrency 8 --timeout 6000
 *
 * Reads the TS source file directly via a regex so we don't need to compile.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = resolve(ROOT, 'src/services/rss/sources.ts')

const args = new Set(process.argv.slice(2))
const flag = (name, def) => {
  const idx = process.argv.indexOf(name)
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]
  return def
}
const SHOULD_PROBE = args.has('--probe')
const CONCURRENCY = Number(flag('--concurrency', 12))
const TIMEOUT = Number(flag('--timeout', 7000))

function parseSources(text) {
  // The DEFAULT_SOURCES array literal — capture { id, label, feedUrl, alternateFeedUrls?, enabled, maxItemsPerRun }
  const out = []
  const re = /\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'\s*,\s*feedUrl:\s*'([^']+)'(?:[^}]*?alternateFeedUrls:\s*\[\s*([^\]]*?)\s*\])?[\s\S]*?maxItemsPerRun:\s*(\d+)\s*,\s*enabled:\s*(true|false)[\s\S]*?\}/g
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
    })
  }
  return out
}

function categorize(src) {
  const id = src.id.toLowerCase()
  const label = src.label.toLowerCase()
  if (id.includes('sport') || id.includes('spor') || id.includes('soccer') || id.includes('f1-') || id.includes('uefa') || id.includes('transfermarkt') || id.includes('fanatik') || id.includes('fotomac') || id.includes('sporx') || id.includes('ajansspor') || id.includes('goal-') || id.includes('voleybol') || id.includes('basketbol') || id.includes('futbol') || id.includes('world-cup') || id.includes('dunya-kupasi')) return 'Spor'
  if (id.includes('kripto') || id.includes('coindesk') || id.includes('cointelegraph') || id.includes('kriptokoin') || id.includes('btchaber')) return 'Kripto'
  if (id.includes('ekonomi') || id.includes('finans') || id.includes('borsa') || id.includes('bigpara') || id.includes('bloomberg') || id.includes('cnbc') || id.includes('dunya-ekonomi') || id.includes('ekonomim')) return 'Ekonomi/Finans'
  if (id.includes('magazin') || id.includes('variety') || id.includes('billboard') || id.includes('tmz') || id.includes('hollywood')) return 'Magazin'
  if (id.includes('teknoloji') || id.includes('tech') || id.includes('verge') || id.includes('wired') || id.includes('arstechnica') || id.includes('venturebeat') || id.includes('mit-tech') || id.includes('shiftdelete') || id.includes('webtekno') || id.includes('donanimhaber') || id.includes('chip-tr') || id.includes('openai') || id.includes('google-blog') || id.includes('microsoft-blog') || id.includes('apple-newsroom') || id.includes('bilim')) return 'Teknoloji'
  if (id.includes('saglik') || id.includes('health') || id.includes('who-news') || id.includes('nih-news') || id.includes('lancet') || id.includes('cdc') || id.includes('medimagazin')) return 'Sağlık'
  if (id.includes('siyaset') || id.includes('politika') || id.includes('politics')) return 'Siyaset'
  if (id.includes('gastronomi') || id.includes('yemek') || id.includes('lezzet')) return 'Gastronomi'
  if (id.includes('otomobil') || id.includes('arabalar') || id.includes('oto-com')) return 'Otomobil'
  if (id.includes('kultur') || id.includes('seyahat')) return 'Kültür/Seyahat'
  if (id.includes('yasam')) return 'Yaşam'
  if (id.includes('world') || id.includes('dunya') || id.includes('reuters') || id.includes('ap-news') || id.includes('aljazeera') || id.includes('guardian') || id.includes('france24') || id.includes('bbc-') || id.includes('sky-news') || id.includes('dw-') || id.includes('nature') || id.includes('science-daily') || id.includes('sputnik') || id.includes('nyt') || id.includes('wapo')) return 'Dünya/Uluslararası'
  if (id.includes('sondakika') || id.includes('son-dakika') || id.includes('breaking')) return 'Son Dakika'
  if (label.includes('google haberler') || id.startsWith('google-news-tr')) return 'Google News Agregatörü'
  return 'Gündem/Genel'
}

const text = readFileSync(SRC, 'utf8')
const sources = parseSources(text)

console.log(`\n📡 Toplam tanımlı kaynak (rss/sources.ts): ${sources.length}`)
console.log(`✅ Aktif: ${sources.filter((s) => s.enabled).length}`)
console.log(`⛔ Devre dışı: ${sources.filter((s) => !s.enabled).length}`)

const byCat = new Map()
for (const s of sources) {
  const cat = categorize(s)
  if (!byCat.has(cat)) byCat.set(cat, [])
  byCat.get(cat).push(s)
}

const sortedCats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)
console.log('\n📊 Kategoriye göre dağılım:')
for (const [cat, items] of sortedCats) {
  const active = items.filter((i) => i.enabled).length
  console.log(`  ${cat.padEnd(28)} ${String(items.length).padStart(3)} tanımlı / ${String(active).padStart(3)} aktif`)
}

if (!SHOULD_PROBE) {
  console.log('\n📋 Tüm kaynaklar (kategorize):')
  for (const [cat, items] of sortedCats) {
    console.log(`\n── ${cat} ────────────────`)
    for (const s of items) {
      const flagText = s.enabled ? '✅' : '⛔'
      console.log(`  ${flagText} ${s.id.padEnd(28)} — ${s.label}`)
    }
  }
  console.log(`\n💡 Canlı durum kontrolü için: node scripts/audit-rss-sources.mjs --probe`)
  process.exit(0)
}

console.log(`\n🔍 ${sources.filter((s) => s.enabled).length} aktif kaynak probe ediliyor (concurrency=${CONCURRENCY}, timeout=${TIMEOUT}ms)\n`)

async function probe(url, timeoutMs) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'nahaber-source-audit/1.0',
        Accept: 'application/rss+xml, application/atom+xml, text/xml, application/xml, */*',
      },
      redirect: 'follow',
    })
    const elapsed = Date.now() - start
    if (!res.ok) return { ok: false, status: res.status, elapsed, reason: `HTTP ${res.status}` }
    const text = await res.text()
    const length = text.length
    const hasItems = /<item\b|<entry\b|<haber\b/i.test(text)
    if (length < 200) return { ok: false, status: res.status, elapsed, reason: `empty (${length}b)` }
    if (!hasItems) return { ok: false, status: res.status, elapsed, reason: 'no <item>/<entry>/<haber>' }
    const itemCount =
      (text.match(/<item\b/gi) || []).length ||
      (text.match(/<entry\b/gi) || []).length ||
      (text.match(/<haber\b/gi) || []).length
    return { ok: true, status: res.status, elapsed, reason: `${itemCount} items, ${length}b` }
  } catch (e) {
    clearTimeout(t)
    const elapsed = Date.now() - start
    return { ok: false, elapsed, reason: e.name === 'AbortError' ? 'timeout' : (e.code ?? e.message ?? 'fetch error') }
  } finally {
    clearTimeout(t)
  }
}

const active = sources.filter((s) => s.enabled)
const results = []
let inflight = 0
let i = 0

await new Promise((done) => {
  function next() {
    while (inflight < CONCURRENCY && i < active.length) {
      const src = active[i++]
      inflight++
      probe(src.feedUrl, TIMEOUT)
        .then(async (r) => {
          if (!r.ok && src.alternates.length) {
            for (const alt of src.alternates) {
              const r2 = await probe(alt, TIMEOUT)
              if (r2.ok) {
                r = { ...r2, reason: `[alt] ${r2.reason}` }
                break
              }
            }
          }
          return r
        })
        .then((r) => {
          results.push({ src, r })
          const sym = r.ok ? '✅' : '❌'
          console.log(`${sym} ${src.id.padEnd(28)} ${String(r.elapsed || '?').padStart(5)}ms  ${r.reason}`)
        })
        .catch((e) => {
          results.push({ src, r: { ok: false, reason: String(e) } })
          console.log(`❌ ${src.id.padEnd(28)}        ${e}`)
        })
        .finally(() => {
          inflight--
          if (i >= active.length && inflight === 0) done()
          else next()
        })
    }
  }
  next()
})

const okCount = results.filter((x) => x.r.ok).length
const failCount = results.length - okCount
console.log(`\n──────── ÖZET ────────`)
console.log(`Aktif kaynak: ${active.length}`)
console.log(`Çalışıyor:    ${okCount}  (${Math.round((okCount / active.length) * 100)}%)`)
console.log(`Başarısız:    ${failCount}`)

if (failCount > 0) {
  console.log(`\n⚠️  Başarısız kaynaklar:`)
  for (const { src, r } of results.filter((x) => !x.r.ok)) {
    console.log(`  ❌ ${src.id.padEnd(28)} ${r.reason}  →  ${src.feedUrl}`)
  }
}
