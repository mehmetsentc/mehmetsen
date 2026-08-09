#!/usr/bin/env node
/**
 * Diagnose: news pipeline health — recent news, queue, cronRuns, sample RSS.
 */
import { createRequire } from 'node:module'
import { loadEnvFile, getNewsroomSecret } from './newsroom-shared.mjs'

loadEnvFile('.env.local')
loadEnvFile('.env')

const require = createRequire(import.meta.url)
const admin = require('firebase-admin')

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || ''
  privateKey = privateKey.replace(/\\n/g, '\n')
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  })
}

const db = admin.firestore()
const secret = process.env.CRON_SECRET || process.env.NEWSROOM_CRON_SECRET || process.env.NEWS_INGEST_SECRET
const base = 'https://www.nahaber.com'

function ago(ms) {
  if (!ms) return '?'
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 60) return `${m} dk önce`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} sa önce`
  return `${Math.round(h / 24)} gün önce`
}

function ts(v) {
  if (!v) return null
  if (typeof v === 'number') return v
  if (v.toMillis) return v.toMillis()
  if (v._seconds) return v._seconds * 1000
  return null
}

async function main() {
  console.log('=== LIVE HEALTH ===')
  const health = await fetch(`${base}/api/health`).then((r) => r.json())
  console.log(health)

  console.log('\n=== NEWS (son 8, publishedAt) ===')
  const news = await db.collection('news').orderBy('publishedAt', 'desc').limit(8).get()
  for (const d of news.docs) {
    const x = d.data()
    const t = ts(x.publishedAt) || ts(x.createdAt)
    console.log(`  ${ago(t)} | ${x.status || '?'} | ${(x.categoryId || x.category || '').slice(0, 20)} | ${(x.title || '').slice(0, 70)}`)
  }

  console.log('\n=== newsQueue status counts (son 50) ===')
  const q = await db.collection('newsQueue').orderBy('createdAt', 'desc').limit(50).get()
  const counts = {}
  for (const d of q.docs) {
    const s = d.data().status || 'unknown'
    counts[s] = (counts[s] || 0) + 1
  }
  console.log(counts)
  console.log('son 8:')
  for (const d of q.docs.slice(0, 8)) {
    const x = d.data()
    console.log(
      `  ${ago(ts(x.createdAt))} | ${x.status} | ${(x.input?.originalTitle || x.title || '').slice(0, 60)}`
    )
  }

  console.log('\n=== cronRuns (son 15) ===')
  try {
    const runs = await db.collection('cronRuns').orderBy('startedAt', 'desc').limit(15).get()
    console.log(`count=${runs.size}`)
    for (const d of runs.docs) {
      const x = d.data()
      console.log(
        `  ${ago(ts(x.startedAt))} | ${x.jobName} | ${x.status} | ${x.triggeredBy || '?'} | err=${(x.error || '').slice(0, 80)}`
      )
    }
  } catch (e) {
    console.log('cronRuns error:', e.message)
  }

  console.log('\n=== PROBE CRONS ===')
  if (!secret) {
    console.log('no CRON_SECRET')
    return
  }
  const paths = [
    '/api/cron/newsroom/breaking',
    '/api/cron/newsroom/gundem',
    '/api/cron/newsroom/process-queue',
    '/api/cron/newsroom/ingest',
    '/api/cron/news-ingest',
  ]
  for (const path of paths) {
    const t0 = Date.now()
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(120_000),
      })
      const text = await res.text()
      console.log(`  ${res.status} ${path} (${Date.now() - t0}ms) ${text.slice(0, 220)}`)
    } catch (e) {
      console.log(`  FAIL ${path} (${Date.now() - t0}ms) ${e.message}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
