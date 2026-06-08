#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

export function loadEnvFile(filename) {
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

export function getNewsroomSecret() {
  return (
    process.env.NEWSROOM_CRON_SECRET?.trim() ||
    process.env.NEWS_INGEST_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.EVENTS_SYNC_SECRET?.trim()
  )
}

export function getBaseUrl() {
  return (
    process.env.NEWSROOM_APP_URL ||
    process.env.NEWS_INGEST_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

export async function triggerNewsroom(path) {
  loadEnvFile('.env.local')
  loadEnvFile('.env')

  const secret = getNewsroomSecret()
  const baseUrl = getBaseUrl()

  if (!secret) {
    console.error('Missing NEWSROOM_CRON_SECRET or CRON_SECRET in .env.local')
    process.exit(1)
  }

  const url = `${baseUrl}${path}`
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
    console.error('Newsroom run failed:', res.status, json)
    process.exit(1)
  }

  console.log('Complete:', JSON.stringify(json, null, 2))
}
