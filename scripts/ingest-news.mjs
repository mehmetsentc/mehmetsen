#!/usr/bin/env node
/**
 * Trigger RSS → AI news ingestion via the secured API route.
 *
 * Usage:
 *   npm run ingest-news
 *   NEWS_INGEST_APP_URL=https://nahaber.vercel.app npm run ingest-news
 *
 * Requires CRON_SECRET or NEWS_INGEST_SECRET in .env.local (or env).
 * For local dev the Next.js server must be running (npm run dev).
 *
 * Vercel cron: see vercel.json — runs every minute with CRON_SECRET.
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
  console.error(
    'Missing NEWS_INGEST_SECRET or CRON_SECRET. Set it in .env.local or the environment.'
  )
  process.exit(1)
}

const url = `${baseUrl}/api/cron/news-ingest`

console.log(`POST ${url}`)

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
  console.error('Ingest failed:', res.status, json)
  process.exit(1)
}

console.log('Ingest complete:', JSON.stringify(json, null, 2))
