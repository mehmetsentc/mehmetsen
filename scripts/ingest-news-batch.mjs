#!/usr/bin/env node
/**
 * Category-targeted RSS batch ingest (last N days, per-category caps).
 *
 * Usage:
 *   npm run ingest-news-batch
 *   node scripts/ingest-news-batch.mjs --days=30 --per-category=3 --max-ai=24
 *   node scripts/ingest-news-batch.mjs --categories=gundem,spor,teknoloji
 *
 * Requires CRON_SECRET or NEWS_INGEST_SECRET in .env.local.
 * Next.js dev server must be running on localhost:3000 (or set NEWS_INGEST_APP_URL).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function loadEnvFile(filename) {
  const path = join(root, filename)
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const secret =
  process.env.NEWS_INGEST_SECRET?.trim() ||
  process.env.CRON_SECRET?.trim() ||
  process.env.EVENTS_SYNC_SECRET?.trim()
const baseUrl = (
  process.env.NEWS_INGEST_APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3000'
).replace(/\/$/, '')

if (!secret) {
  console.error('Missing NEWS_INGEST_SECRET or CRON_SECRET in .env.local')
  process.exit(1)
}

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : fallback
}

const categories = readArg(
  'categories',
  'gundem,spor,teknoloji,kultur,saglik,magazin,dunya'
)
const days = readArg('days', '30')
const perCategory = readArg('per-category', readArg('perCategory', '3'))
const maxAi = readArg('max-ai', readArg('maxAiCalls', process.env.NEWS_INGEST_MAX_AI_CALLS || '24'))

const params = new URLSearchParams({
  mode: 'batch',
  categories,
  days,
  perCategory,
  maxAiCalls: maxAi,
})

const url = `${baseUrl}/api/cron/news-ingest?${params}`

console.log(`POST ${url}`)
console.log(`Categories: ${categories}`)
console.log(`Days: ${days}, perCategory: ${perCategory}, maxAiCalls: ${maxAi}`)

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  },
})

const body = await res.text()
let json
try {
  json = JSON.parse(body)
} catch {
  json = { raw: body }
}

if (!res.ok) {
  console.error('Batch ingest failed:', res.status, json)
  process.exit(1)
}

console.log('Batch ingest complete:', JSON.stringify(json, null, 2))

if (json.batch?.perCategory) {
  console.log('\nPer category:')
  for (const [cat, stats] of Object.entries(json.batch.perCategory)) {
    console.log(`  ${cat}: created=${stats.created}, skipped=${stats.skipped}, failed=${stats.failed}, fetched=${stats.fetched}`)
  }
}
