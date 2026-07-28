#!/usr/bin/env node
/**
 * Backfill missing featuredAt on published Öne Çıkan pins.
 * Uses publishedAt/updatedAt (does NOT bump to now — avoids burying recent pins).
 * Does NOT demote; trimming happens on CMS pin via demoteExcessFeaturedPins.
 *
 * Usage: node scripts/backfill-featured-at.mjs
 */
import { createRequire } from 'module'
import { loadEnvFile } from './newsroom-shared.mjs'

loadEnvFile('.env.local')
const require = createRequire(import.meta.url)
const admin = require('firebase-admin')

if (!admin.apps.length) {
  const pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: pk,
    }),
  })
}

const db = admin.firestore()

function toEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (value?.toMillis) return value.toMillis()
  if (typeof value?._seconds === 'number') return value._seconds * 1000
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  return 0
}

function pinTime(data) {
  return (
    toEpochMs(data.featuredAt) ||
    toEpochMs(data.publishedAt) ||
    toEpochMs(data.updatedAt) ||
    toEpochMs(data.createdAt) ||
    Date.now()
  )
}

const snap = await db.collection('news').where('featured', '==', true).get()
let backfilled = 0

for (const doc of snap.docs) {
  const data = doc.data()
  if (data.status !== 'published') continue
  if (toEpochMs(data.featuredAt) > 0) continue

  const featuredAt = pinTime(data)
  await doc.ref.update({
    featuredAt,
    featured: true,
    isEditorPick: true,
  })
  backfilled += 1
  console.log(
    'backfill',
    new Date(featuredAt).toISOString().slice(0, 16),
    String(data.source || '').slice(0, 24),
    String(data.title || '').slice(0, 50)
  )
}

console.log('Done', { backfilled, scanned: snap.size })
