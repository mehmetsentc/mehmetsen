#!/usr/bin/env node
/**
 * Purge newsQueue: delete all pending/failed/dead_letter items older than today (Turkey time).
 * Keeps today's items and all published/skipped/processing items.
 * Uses composite index (status + createdAt ASC) for efficient queries.
 * Usage: node scripts/purge-old-pending.mjs
 */
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf8')
const env = {}
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?([\s\S]*?)["']?\s*$/)
  if (m) env[m[1]] = m[2]
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  }),
})
const db = getFirestore()

// ── Cutoff: start of today Turkey time (UTC+3) ──────────────────────────────
const now = new Date()
const turkeyOffsetMs = 3 * 60 * 60 * 1000
const todayTurkey = new Date(now.getTime() + turkeyOffsetMs)
todayTurkey.setUTCHours(0, 0, 0, 0)
const cutoff = todayTurkey.getTime() - turkeyOffsetMs

console.log('━'.repeat(60))
console.log(`Now (UTC):          ${now.toISOString()}`)
console.log(`Cutoff (UTC):       ${new Date(cutoff).toISOString()}`)
console.log(`Turkey midnight:    ${todayTurkey.toISOString().replace('Z', ' UTC')}`)
console.log('━'.repeat(60))

const col = db.collection('newsQueue')
const DELETE_STATUSES = ['pending', 'failed', 'dead_letter']

// ── Phase 1: Quick counts ───────────────────────────────────────────────────
console.log('\n📊 Phase 1: Counting items to delete per status...')
const countPromises = DELETE_STATUSES.map(async (status) => {
  const oldSnap = await col
    .where('status', '==', status)
    .where('createdAt', '<', cutoff)
    .count()
    .get()
  const todaySnap = await col
    .where('status', '==', status)
    .where('createdAt', '>=', cutoff)
    .count()
    .get()
  return {
    status,
    toDelete: oldSnap.data().count,
    toKeep: todaySnap.data().count,
  }
})
const counts = await Promise.all(countPromises)
let totalToDelete = 0
let totalToKeep = 0
for (const c of counts) {
  console.log(`  ${c.status}: ${c.toDelete} to delete, ${c.toKeep} today (kept)`)
  totalToDelete += c.toDelete
  totalToKeep += c.toKeep
}
console.log(`  TOTAL: ${totalToDelete} to delete, ${totalToKeep} today items kept`)

if (totalToDelete === 0) {
  console.log('\n✅ Nothing to delete — queue is clean!')
  process.exit(0)
}

// ── Phase 2: Delete per status using compound query + composite index ───────
console.log(`\n🗑️  Phase 2: Deleting ${totalToDelete} old items...`)
let grandTotal = 0

for (const status of DELETE_STATUSES) {
  let deleted = 0
  let round = 0

  while (true) {
    round++
    const snap = await col
      .where('status', '==', status)
      .where('createdAt', '<', cutoff)
      .orderBy('createdAt', 'asc')
      .limit(400)
      .get()

    if (snap.empty) break

    const batch = db.batch()
    for (const doc of snap.docs) {
      batch.delete(doc.ref)
    }
    await batch.commit()
    deleted += snap.size
    grandTotal += snap.size

    if (round % 10 === 0 || snap.size < 400) {
      console.log(`  [${status}] round ${round}: deleted ${deleted} so far (batch ${snap.size})`)
    }

    if (snap.size < 400) break
  }

  console.log(`  ✓ ${status}: ${deleted} deleted`)
}

// ── Phase 3: Verify remaining ───────────────────────────────────────────────
console.log('\n📊 Phase 3: Verifying remaining items...')
const verifyPromises = ['pending', 'failed', 'dead_letter', 'published', 'skipped', 'processing'].map(async (status) => {
  const snap = await col.where('status', '==', status).count().get()
  return { status, count: snap.data().count }
})
const remaining = await Promise.all(verifyPromises)

console.log('\n' + '━'.repeat(60))
console.log('✅ PURGE COMPLETE')
console.log('━'.repeat(60))
console.log(`Deleted:       ${grandTotal}`)
console.log(`Kept (today):  ${totalToKeep}`)
console.log('\nRemaining by status:')
for (const r of remaining) {
  if (r.count > 0) console.log(`  ${r.status}: ${r.count}`)
}
console.log('━'.repeat(60))

process.exit(0)
