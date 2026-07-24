#!/usr/bin/env node
/**
 * Local backfill: dunya-kupasi-2026 → futbol (post-final by default).
 * Usage:
 *   node scripts/migrate-post-worldcup.mjs --dry-run
 *   node scripts/migrate-post-worldcup.mjs
 *   node scripts/migrate-post-worldcup.mjs --all
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

function loadEnv() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
}

function get(name) {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

loadEnv()

const dryRun = process.argv.includes('--dry-run')
const moveAll = process.argv.includes('--all')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = Math.min(Number(limitArg?.split('=')[1] || 2000), 5000)
const DEFAULT_SINCE_MS = Date.UTC(2026, 6, 19)

const privateKey = get('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n')
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: get('FIREBASE_ADMIN_PROJECT_ID'),
      clientEmail: get('FIREBASE_ADMIN_CLIENT_EMAIL'),
      privateKey,
    }),
  })
}

const db = getFirestore()

const snap = await db
  .collection('news')
  .where('categoryId', '==', 'dunya-kupasi-2026')
  .limit(limit)
  .get()

const docs = snap.docs
  .map((doc) => {
    const data = doc.data()
    const publishedAt =
      typeof data.publishedAt === 'number'
        ? data.publishedAt
        : Date.parse(String(data.publishedAt ?? '')) || 0
    return {
      doc,
      title: String(data.title ?? ''),
      publishedAt,
    }
  })
  .sort((a, b) => b.publishedAt - a.publishedAt)

let updated = 0
let skipped = 0
let failed = 0
const sample = []

for (const row of docs) {
  // Missing publishedAt → keep in archive unless --all
  if (!moveAll && (!(row.publishedAt > 0) || row.publishedAt < DEFAULT_SINCE_MS)) {
    skipped++
    continue
  }
  try {
    if (!dryRun) {
      await row.doc.ref.update({
        categoryId: 'futbol',
        category: 'futbol',
        migratedFromWorldCupAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    updated++
    if (sample.length < 20) {
      sample.push({
        id: row.doc.id,
        title: row.title.slice(0, 80),
        publishedAt: row.publishedAt
          ? new Date(row.publishedAt).toISOString().slice(0, 10)
          : '?',
      })
    }
  } catch (err) {
    failed++
    console.error('fail', row.doc.id, err instanceof Error ? err.message : err)
  }
}

console.log(
  JSON.stringify(
    {
      dryRun,
      moveAll,
      scanned: docs.length,
      updated,
      skippedBeforeFinal: skipped,
      failed,
      sample,
    },
    null,
    2
  )
)
