#!/usr/bin/env node
/**
 * Trigger the daily event sync.
 *
 * Usage:
 *   npm run sync-events                    # direct Admin SDK sync (local default)
 *   npm run sync-events -- --http          # POST /api/events/sync (needs dev server locally)
 *   npm run sync-events -- --direct        # force direct Admin SDK sync
 *   EVENTS_SYNC_APP_URL=https://nahaber.vercel.app npm run sync-events  # remote HTTP only (cron)
 *   EVENTS_SYNC_APP_URL=http://localhost:3000 is ignored — direct sync is used instead (pass --http to override).
 *
 * Direct mode (default locally): calls eventSyncService via Firebase Admin SDK — no dev server.
 * HTTP mode: secured API route; requires EVENTS_SYNC_SECRET (or CRON_SECRET).
 *
 * Crontab (daily 00:00 Turkey / Europe-Istanbul):
 *   0 0 * * * TZ=Europe/Istanbul cd /path/to/nahaber && EVENTS_SYNC_APP_URL=https://your-app.vercel.app /usr/bin/node scripts/sync-events.mjs >> /var/log/nahaber-sync.log 2>&1
 *
 * Vercel cron: see vercel.json — hits /api/events/sync with CRON_SECRET automatically.
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { Agent } from 'undici'

const root = process.cwd()
const args = process.argv.slice(2)
const forceHttp = args.includes('--http')
const forceDirect = args.includes('--direct')

/** 15 min — full 81-city scrape often exceeds undici's default ~300s headers timeout. */
const HTTP_TIMEOUT_MS = 15 * 60 * 1000

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

function hasFirebaseAdminCreds() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return true
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim()
  )
}

function isLocalAppUrl(url) {
  if (!url) return false
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(
    url.replace(/\/$/, '')
  )
}

const rawSyncAppUrl = process.env.EVENTS_SYNC_APP_URL?.trim()
const explicitRemoteUrl =
  rawSyncAppUrl && !isLocalAppUrl(rawSyncAppUrl) ? rawSyncAppUrl : undefined

if (rawSyncAppUrl && isLocalAppUrl(rawSyncAppUrl) && !forceHttp && !forceDirect) {
  console.warn(
    `EVENTS_SYNC_APP_URL is local (${rawSyncAppUrl}) — using direct Admin SDK sync instead of HTTP.`
  )
  console.warn(
    'Unset EVENTS_SYNC_APP_URL for local runs, or pass --http to force HTTP against the dev server.\n'
  )
}

const useDirect = forceDirect || (!forceHttp && !explicitRemoteUrl)

function runDirectSync() {
  if (!hasFirebaseAdminCreds()) {
    console.error(
      'Direct sync requires Firebase Admin credentials in .env.local or the environment.'
    )
    console.error(
      'Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_ADMIN_PROJECT_ID + CLIENT_EMAIL + PRIVATE_KEY.'
    )
    process.exit(1)
  }

  const tsxBin = join(root, 'node_modules', '.bin', 'tsx')
  const script = join(root, 'scripts', 'sync-events-direct.ts')
  if (!existsSync(tsxBin)) {
    console.error('Missing tsx. Run: npm install')
    process.exit(1)
  }

  console.log(
    'Running event sync directly (Firebase Admin SDK — no dev server required).'
  )
  console.log('Scraping 81 provinces; progress logs appear below.\n')

  const result = spawnSync(tsxBin, [script], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  })
  process.exit(result.status ?? 1)
}

async function assertDevServerReachable(baseUrl) {
  const checkUrl = `${baseUrl}/`
  try {
    await fetch(checkUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(8_000),
    })
  } catch (error) {
    const refused =
      error?.cause?.code === 'ECONNREFUSED' ||
      error?.cause?.code === 'ENOTFOUND' ||
      error?.name === 'TimeoutError' ||
      error?.name === 'AbortError'
    console.error(`Cannot reach ${baseUrl}.`)
    if (refused) {
      console.error('The dev server does not appear to be running. Start it with: npm run dev')
      console.error(
        'Or run without --http (default) for direct Admin SDK sync — no HTTP server needed.'
      )
    } else {
      console.error('Connection failed:', error instanceof Error ? error.message : error)
    }
    process.exit(1)
  }
}

async function runHttpSync() {
  const secret =
    process.env.EVENTS_SYNC_SECRET?.trim() || process.env.CRON_SECRET?.trim()
  const baseUrl = (
    explicitRemoteUrl ||
    (forceHttp && rawSyncAppUrl) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')

  if (!secret) {
    console.error(
      'HTTP sync requires EVENTS_SYNC_SECRET or CRON_SECRET in .env.local or the environment.'
    )
    console.error('For local runs, omit --http to use direct Admin SDK sync instead.')
    process.exit(1)
  }

  const isLocal = isLocalAppUrl(baseUrl)
  if (isLocal) {
    await assertDevServerReachable(baseUrl)
  }

  const url = `${baseUrl}/api/events/sync`
  const timeoutMin = HTTP_TIMEOUT_MS / 60_000

  console.log(`POST ${url}`)
  console.log(
    `Waiting up to ${timeoutMin} min for response (81-city scrape may take several minutes)…`
  )

  const dispatcher = new Agent({
    connectTimeout: 30_000,
    headersTimeout: HTTP_TIMEOUT_MS,
    bodyTimeout: HTTP_TIMEOUT_MS,
  })

  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      dispatcher,
    })
  } catch (error) {
    console.error('Sync request failed:', error instanceof Error ? error.message : error)
    if (isLocal) {
      console.error(
        'Tip: use direct sync (default) — npm run sync-events — to skip the dev server and long HTTP wait.'
      )
    }
    process.exit(1)
  }

  const body = await res.text()
  let json
  try {
    json = JSON.parse(body)
  } catch {
    json = { raw: body }
  }

  if (!res.ok) {
    console.error('Sync failed:', res.status, json)
    process.exit(1)
  }

  console.log('Sync complete:', JSON.stringify(json, null, 2))
}

if (useDirect) {
  runDirectSync()
} else {
  await runHttpSync()
}
