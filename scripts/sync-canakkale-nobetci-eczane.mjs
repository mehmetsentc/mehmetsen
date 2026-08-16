#!/usr/bin/env node
/**
 * Sync Çanakkale Eczacı Odası on-duty pharmacies into Firestore `dutyPharmacies`.
 *
 * Usage:
 *   npm run sync-canakkale-nobetci-eczane                 # direct Admin SDK (default)
 *   npm run sync-canakkale-nobetci-eczane -- --http       # POST /api/cron/canakkale-nobetci-eczane
 *
 * Requires Firebase Admin credentials in .env.local for direct mode, or
 * CRON_SECRET / EVENTS_SYNC_SECRET for HTTP mode.
 *
 * Vercel cron: vercel.json → /api/cron/canakkale-nobetci-eczane at 10:00 Europe/Istanbul.
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
const forceHttp = args.includes('--http')

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

function runDirectSync() {
  if (!hasFirebaseAdminCreds()) {
    console.error('Direct sync requires Firebase Admin credentials in .env.local.')
    process.exit(1)
  }

  const tsxBin = join(root, 'node_modules', '.bin', 'tsx')
  const script = join(root, 'scripts', 'sync-canakkale-nobetci-eczane-direct.ts')
  if (!existsSync(tsxBin)) {
    console.error('Missing tsx. Run: npm install')
    process.exit(1)
  }

  console.log('Running Çanakkale nöbetçi eczane sync (Firebase Admin SDK)…\n')
  const result = spawnSync(tsxBin, [script], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  })
  process.exit(result.status ?? 1)
}

async function runHttpSync() {
  const secret =
    process.env.EVENTS_SYNC_SECRET?.trim() || process.env.CRON_SECRET?.trim()
  const baseUrl = (
    process.env.EVENTS_SYNC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')

  if (!secret) {
    console.error('HTTP sync requires EVENTS_SYNC_SECRET or CRON_SECRET.')
    process.exit(1)
  }

  const url = `${baseUrl}/api/cron/canakkale-nobetci-eczane`
  console.log(`POST ${url}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(120_000),
  })

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

if (forceHttp || process.env.EVENTS_SYNC_APP_URL?.trim()) {
  await runHttpSync()
} else {
  runDirectSync()
}
