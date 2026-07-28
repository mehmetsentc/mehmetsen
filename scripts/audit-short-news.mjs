#!/usr/bin/env node
/**
 * Kısa yayın denetimi + taslak / genişletme.
 *
 * Kullanım:
 *   node scripts/audit-short-news.mjs
 *   node scripts/audit-short-news.mjs --min-words=220 --limit=200
 *   node scripts/audit-short-news.mjs --action=draft --apply --limit=50
 *   node scripts/audit-short-news.mjs --action=expand --apply --limit=8
 *
 * Varsayılan: sadece tarama (dry-run). --apply olmadan Firestore yazılmaz.
 *
 * action=draft  → status=draft, featured kaldır
 * action=expand → thinContentBackfillWorker (kaynak URL ile yeniden yaz; olmazsa taslak)
 */
import { createRequire } from 'module'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnvFile } from './newsroom-shared.mjs'

loadEnvFile('.env.local')
loadEnvFile('.env')

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')

const MIN_DEFAULT = 220

function parseArgs(argv) {
  const out = {
    action: 'scan', // scan | draft | expand
    apply: false,
    minWords: MIN_DEFAULT,
    limit: 200,
    outFile: '',
  }
  for (const arg of argv) {
    if (arg === '--apply') out.apply = true
    else if (arg.startsWith('--action=')) out.action = arg.slice('--action='.length)
    else if (arg.startsWith('--min-words=')) out.minWords = Number(arg.slice('--min-words='.length)) || MIN_DEFAULT
    else if (arg.startsWith('--limit=')) out.limit = Number(arg.slice('--limit='.length)) || 200
    else if (arg.startsWith('--out=')) out.outFile = arg.slice('--out='.length)
  }
  if (!['scan', 'draft', 'expand'].includes(out.action)) {
    console.error('Geçersiz --action. Kullanım: scan | draft | expand')
    process.exit(1)
  }
  return out
}

function countPlainWords(text) {
  if (!text) return 0
  const plain = String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return 0
  return plain.split(/\s+/).filter(Boolean).length
}

function bodyText(data) {
  return String(data.description ?? data.content ?? data.body ?? '').trim()
}

function bodyWords(data) {
  return countPlainWords(bodyText(data))
}

if (!admin.apps.length) {
  const pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID || !pk) {
    console.error('Firebase admin env eksik (.env.local)')
    process.exit(1)
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: pk,
    }),
  })
}

const db = admin.firestore()
const opts = parseArgs(process.argv.slice(2))

console.log('audit-short-news', {
  action: opts.action,
  apply: opts.apply,
  minWords: opts.minWords,
  limit: opts.limit,
})

if (opts.action === 'expand') {
  if (!opts.apply) {
    console.log('Dry-run: expand için --apply gerekli. Önce scan çalıştırın veya --apply ekleyin.')
    process.exit(0)
  }
  process.env.THIN_BACKFILL_MIN_WORDS = String(opts.minWords)
  process.env.THIN_BACKFILL_MAX_PER_RUN = String(opts.limit)
  process.env.THIN_BACKFILL_SCAN_LIMIT = String(Math.max(opts.limit * 4, 150))

  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(
    'npx',
    ['tsx', 'scripts/run-thin-backfill.mjs', `--min-words=${opts.minWords}`, `--limit=${opts.limit}`],
    { stdio: 'inherit', env: process.env, cwd: process.cwd() }
  )
  process.exit(r.status ?? 1)
}

// ── scan / draft ────────────────────────────────────────────────────────────
const snap = await db
  .collection('news')
  .where('status', '==', 'published')
  .orderBy('publishedAt', 'desc')
  .limit(Math.min(Math.max(opts.limit, 50), 500))
  .get()

const rows = []
for (const doc of snap.docs) {
  const data = doc.data()
  const words = bodyWords(data)
  if (words >= opts.minWords) continue
  const sourceUrl = String(data.sourceUrl ?? '').trim()
  rows.push({
    id: doc.id,
    words,
    chars: bodyText(data).length,
    title: String(data.title ?? '').slice(0, 90),
    slug: String(data.slug ?? ''),
    categoryId: String(data.categoryId ?? data.category ?? ''),
    featured: Boolean(data.featured),
    hasSourceUrl: sourceUrl.startsWith('http'),
    sourceUrl: sourceUrl.slice(0, 120),
    publishedAt: data.publishedAt ?? null,
  })
}

rows.sort((a, b) => a.words - b.words)

const buckets = {
  under80: rows.filter((r) => r.words < 80).length,
  under120: rows.filter((r) => r.words < 120).length,
  under220: rows.filter((r) => r.words < 220).length,
  noSource: rows.filter((r) => !r.hasSourceUrl).length,
  featured: rows.filter((r) => r.featured).length,
}

console.log('\n=== ÖZET ===')
console.log(`Taranan yayın: ${snap.size}`)
console.log(`Kısa (<${opts.minWords} kelime): ${rows.length}`)
console.log(buckets)
console.log('\nEn kısa 20:')
for (const r of rows.slice(0, 20)) {
  console.log(
    `${String(r.words).padStart(3)}w  feat=${r.featured ? 'Y' : 'n'} src=${r.hasSourceUrl ? 'Y' : 'n'}  ${r.id}  ${r.title}`
  )
}

const reportPath =
  opts.outFile ||
  join(process.cwd(), `.tmp-adsense-audit/short-news-${Date.now()}.json`)
try {
  writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), opts, buckets, scanned: snap.size, rows }, null, 2)
  )
  console.log(`\nRapor: ${reportPath}`)
} catch (err) {
  console.warn('Rapor yazılamadı:', err.message)
}

if (opts.action === 'scan') {
  console.log('\nSonraki adımlar:')
  console.log('  node scripts/audit-short-news.mjs --action=expand --apply --limit=8')
  console.log('  node scripts/audit-short-news.mjs --action=draft --apply --limit=50')
  process.exit(0)
}

// action=draft
if (!opts.apply) {
  console.log(`\nDry-run: ${rows.length} haber taslağa alınırdı. Yazmak için --apply ekleyin.`)
  process.exit(0)
}

const now = Date.now()
let drafted = 0
let failed = 0
const batchLimit = Math.min(rows.length, opts.limit)

for (const row of rows.slice(0, batchLimit)) {
  try {
    await db.collection('news').doc(row.id).update({
      status: 'draft',
      featured: false,
      isEditorPick: false,
      featuredAt: null,
      contentBackfillStatus: 'drafted_thin',
      moderationNote: `İnce içerik (${row.words} kelime) — audit-short-news taslak`,
      updatedAt: now,
    })
    drafted++
    console.log('drafted', row.words + 'w', row.id, row.title.slice(0, 50))
  } catch (err) {
    failed++
    console.error('fail', row.id, err.message)
  }
}

console.log(JSON.stringify({ drafted, failed, considered: batchLimit }, null, 2))
