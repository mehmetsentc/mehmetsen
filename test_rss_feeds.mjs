/**
 * RSS kaynak test scripti
 * Kullanım: node test_rss_feeds.mjs
 */

import { readFileSync } from 'fs'

// ── Kaynakları parse et ────────────────────────────────────────────────────
const src = readFileSync('./src/services/rss/sources.ts', 'utf8')
const blocks = src.split(/(?=\s*\{[\s\n]*id:)/)
const sources = []

for (const block of blocks) {
  const id      = block.match(/id:\s*['"]([^'"]+)['"]/)?.[1]
  const feedUrl = block.match(/feedUrl:\s*['"]([^'"]+)['"]/)?.[1]
  const enabled = block.match(/enabled:\s*(true|false)/)?.[1]
  const label   = block.match(/label:\s*['"]([^'"]+)['"]/)?.[1]
  if (id && feedUrl && enabled === 'true') sources.push({ id, label: label ?? id, feedUrl })
}

console.log(`\n🔍 ${sources.length} etkin kaynak test ediliyor (12s timeout)...\n`)

// ── Test fonksiyonu (Node 18+ fetch) ──────────────────────────────────────
async function testSource({ id, label, feedUrl }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NaHaberRSSChecker/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    })
    clearTimeout(timer)

    if (!res.ok) return { id, label, feedUrl, status: 'HTTP_ERR', detail: `HTTP ${res.status}` }

    const text = await res.text()
    const items = (text.match(/<item>/gi) ?? []).length + (text.match(/<entry>/gi) ?? []).length

    if (items === 0) {
      const hasChannel = /<channel>/i.test(text) || /<feed[\s>]/i.test(text)
      return { id, label, feedUrl, status: hasChannel ? 'EMPTY' : 'NO_RSS',
        detail: hasChannel ? '0 item' : 'RSS yapısı yok' }
    }
    return { id, label, feedUrl, status: 'OK', detail: `${items} item` }
  } catch (err) {
    clearTimeout(timer)
    const msg = String(err?.message ?? err)
    if (msg.includes('abort') || msg.includes('AbortError')) return { id, label, feedUrl, status: 'TIMEOUT', detail: 'timeout' }
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) return { id, label, feedUrl, status: 'DNS', detail: 'domain yok' }
    if (msg.includes('ECONNREFUSED')) return { id, label, feedUrl, status: 'REFUSED', detail: 'bağlantı reddedildi' }
    return { id, label, feedUrl, status: 'ERR', detail: msg.slice(0, 80) }
  }
}

// ── Paralel çalıştır (25 eşzamanlı) ───────────────────────────────────────
const BATCH = 25
const results = []
for (let i = 0; i < sources.length; i += BATCH) {
  const chunk = sources.slice(i, i + BATCH)
  const done = await Promise.all(chunk.map(testSource))
  results.push(...done)
  const n = Math.min(i + BATCH, sources.length)
  process.stderr.write(`  ${n}/${sources.length} kontrol edildi...\r`)
}
process.stderr.write('\n')

// ── Sınıflandır & raporla ─────────────────────────────────────────────────
const ok      = results.filter(r => r.status === 'OK').sort((a,b) => a.id.localeCompare(b.id))
const empty   = results.filter(r => r.status === 'EMPTY')
const noRss   = results.filter(r => r.status === 'NO_RSS')
const timeout = results.filter(r => r.status === 'TIMEOUT')
const httpErr = results.filter(r => r.status === 'HTTP_ERR')
const dns     = results.filter(r => r.status === 'DNS')
const other   = results.filter(r => !['OK','EMPTY','NO_RSS','TIMEOUT','HTTP_ERR','DNS'].includes(r.status))
const bad     = [...empty, ...noRss, ...timeout, ...httpErr, ...dns, ...other]

const L = '═'.repeat(72)
const l = '─'.repeat(72)

console.log(`\n${L}`)
console.log(`✅  ÇALIŞIYOR — ${ok.length} kaynak`)
console.log(L)
for (const r of ok) console.log(`  ${r.id.padEnd(34)} ${r.detail}`)

const sections = [
  [empty,   '⚠️   BOŞ FEED (item yok)'],
  [noRss,   '⚠️   RSS YAPISI BULUNAMADI'],
  [timeout, '⏱   TIMEOUT (12s aşıldı)'],
  [httpErr, '❌  HTTP HATASI'],
  [dns,     '❌  DNS / DOMAIN BULUNAMADI'],
  [other,   '❌  DİĞER HATALAR'],
]
for (const [arr, title] of sections) {
  if (!arr.length) continue
  console.log(`\n${l}\n${title} — ${arr.length} kaynak\n${l}`)
  for (const r of arr)
    console.log(`  ${r.id.padEnd(34)} ${r.detail}  [${r.feedUrl.slice(0,50)}]`)
}

console.log(`\n${L}`)
console.log(`ÖZET:  ✅ ${ok.length} çalışıyor  |  ❌ ${bad.length} başarısız`)
console.log(L)

if (bad.length > 0) {
  console.log('\n📋 Devre dışı bırakılacak kaynak ID\'leri:')
  console.log(bad.map(r => `  ${r.id}`).join('\n'))
}
