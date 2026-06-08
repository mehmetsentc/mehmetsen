#!/usr/bin/env node
/**
 * News archive backfill — last N days of RSS → newsArchive (not feed).
 *
 * Usage:
 *   npm run newsroom-archive
 *   npm run newsroom-archive -- --days=90 --maxAiCalls=20
 *   npm run newsroom-archive -- --http          # POST /api/cron/newsroom/archive
 *   npm run newsroom-archive -- --direct        # force Admin SDK (default locally)
 *
 * Direct mode (default): Firebase Admin SDK — no dev server required.
 * HTTP mode: secured cron route; needs CRON_SECRET / NEWSROOM_CRON_SECRET.
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
const forceHttp = args.includes('--http')
const forceDirect = args.includes('--direct')

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

function readArg(name, fallback) {
  const prefix = `--${name}=`
  const hit = args.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : fallback
}

function runDirect() {
  const days = readArg('days', '90')
  const maxAiCalls = readArg('maxAiCalls', readArg('max-ai', '20'))
  const scriptArgs = [`--days=${days}`, `--maxAiCalls=${maxAiCalls}`]

  const result = spawnSync('npx', ['tsx', 'scripts/newsroom-archive-direct.ts', ...scriptArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(result.status ?? 1)
}

async function runHttp() {
  loadEnvFile('.env.local')
  loadEnvFile('.env')

  const secret =
    process.env.NEWSROOM_CRON_SECRET?.trim() ||
    process.env.NEWS_INGEST_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim()

  if (!secret) {
    console.error('Missing NEWSROOM_CRON_SECRET or CRON_SECRET in .env.local')
    process.exit(1)
  }

  const baseUrl = (
    process.env.NEWSROOM_APP_URL ||
    process.env.NEWS_INGEST_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')

  const days = readArg('days', '90')
  const maxAiCalls = readArg('maxAiCalls', readArg('max-ai', '20'))
  const qs = new URLSearchParams({ days, maxAiCalls })
  const url = `${baseUrl}/api/cron/newsroom/archive?${qs}`

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
    console.error('Archive run failed:', res.status, json)
    process.exit(1)
  }

  console.log('Complete:', JSON.stringify(json, null, 2))
}

loadEnvFile('.env.local')
loadEnvFile('.env')

if (forceHttp) {
  await runHttp()
} else {
  runDirect()
}
