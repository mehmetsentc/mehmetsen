#!/usr/bin/env node
/**
 * Sync YouTube channel RSS into NaHaber news collection.
 *
 * Usage:
 *   node scripts/sync-youtube-rss.mjs
 *   YOUTUBE_RSS_APP_URL=https://nahaber.vercel.app node scripts/sync-youtube-rss.mjs
 *
 * Env:
 *   ONYEDI_YOUTUBE_CHANNEL_ID — YouTube channel ID (required)
 *   CRON_SECRET — Bearer token for HTTP mode
 *   YOUTUBE_RSS_APP_URL — remote app URL for cron route (optional)
 */
import { loadEnvFile, getNewsroomSecret, getBaseUrl } from './newsroom-shared.mjs'

loadEnvFile('.env.local')
loadEnvFile('.env')

const channelId = process.env.ONYEDI_YOUTUBE_CHANNEL_ID?.trim()
if (!channelId) {
  console.error('ONYEDI_YOUTUBE_CHANNEL_ID is required')
  process.exit(1)
}

const appUrl = process.env.YOUTUBE_RSS_APP_URL?.trim() || getBaseUrl()
const secret = getNewsroomSecret()

async function runHttp() {
  const url = `${appUrl.replace(/\/$/, '')}/api/cron/youtube-rss`
  const headers = secret ? { Authorization: `Bearer ${secret}` } : {}
  console.log(`POST ${url}`)
  const res = await fetch(url, { method: 'POST', headers })
  const body = await res.text()
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${body}`)
    process.exit(1)
  }
  console.log(body)
}

runHttp().catch((err) => {
  console.error(err)
  process.exit(1)
})
