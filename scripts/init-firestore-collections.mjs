#!/usr/bin/env node
/**
 * Seed minimal Firestore documents so empty collections appear in Firebase
 * Console. Firestore has no "create collection" API — the first document write
 * creates the collection.
 *
 * Usage:
 *   npm run init-firestore
 *   npm run init-firestore -- --sync-events   # also POST /api/events/sync (needs dev server or prod URL)
 *
 * Requires Firebase Admin credentials in .env.local (same as server routes).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const root = process.cwd()
const INIT_DOC_ID = '_init'

/** Mirrors src/lib/firebase/firestore.ts Collections */
const Collections = {
  USERS: 'users',
  POSTS: 'posts',
  NEWS: 'news',
  NEWS_DRAFTS: 'newsDrafts',
  COMMENTS: 'comments',
  LIKES: 'likes',
  SAVES: 'saved',
  FOLLOWS: 'follows',
  CATEGORIES: 'categories',
  EVENTS: 'events',
  REPORTS: 'reports',
  NOTIFICATIONS: 'notifications',
  CONVERSATIONS: 'conversations',
}

/** Mirrors src/constants/config.ts DEFAULT_CATEGORIES */
const DEFAULT_CATEGORIES = [
  { id: 'son-dakika', name: 'Son Dakika', slug: 'son-dakika', iconName: 'zap', color: '#DC2626' },
  { id: 'yerel-haber', name: 'Yerel Haber', slug: 'yerel-haber', iconName: 'map-pin', color: '#059669' },
  { id: 'gundem', name: 'Gündem', slug: 'gundem', iconName: 'newspaper', color: '#EF4444' },
  { id: 'siyaset', name: 'Siyaset', slug: 'siyaset', iconName: 'landmark', color: '#7C3AED' },
  { id: 'teknoloji', name: 'Teknoloji', slug: 'teknoloji', iconName: 'cpu', color: '#3B82F6' },
  { id: 'spor', name: 'Spor', slug: 'spor', iconName: 'trophy', color: '#10B981' },
  { id: 'ekonomi', name: 'Ekonomi', slug: 'ekonomi', iconName: 'trending-up', color: '#F59E0B' },
  { id: 'kultur', name: 'Kültür', slug: 'kultur', iconName: 'palette', color: '#8B5CF6' },
  { id: 'saglik', name: 'Sağlık', slug: 'saglik', iconName: 'heart', color: '#EC4899' },
  { id: 'dunya', name: 'Dünya', slug: 'dunya', iconName: 'globe', color: '#6B7280' },
  { id: 'bilim', name: 'Bilim', slug: 'bilim', iconName: 'flask', color: '#14B8A6' },
]

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

function readServiceAccount() {
  const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw)
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      }
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey }
  }

  return null
}

const serviceAccount = readServiceAccount()
if (!serviceAccount) {
  console.error(
    'Missing Firebase Admin credentials. Set FIREBASE_ADMIN_* or FIREBASE_SERVICE_ACCOUNT_JSON in .env.local'
  )
  process.exit(1)
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  })
}

const db = getFirestore()
const now = new Date().toISOString()
const results = []

async function countCollection(name) {
  const snap = await db.collection(name).count().get()
  return snap.data().count
}

async function ensureInitDoc(collectionName, payload) {
  const ref = db.collection(collectionName).doc(INIT_DOC_ID)
  const existing = await ref.get()
  if (existing.exists) {
    return { collection: collectionName, action: 'skip', docs: await countCollection(collectionName) }
  }
  await ref.set({
    ...payload,
    _placeholder: true,
    createdAt: now,
    updatedAt: now,
  })
  return { collection: collectionName, action: 'created', docs: await countCollection(collectionName) }
}

async function seedCategories() {
  const col = db.collection(Collections.CATEGORIES)
  const existing = await col.limit(1).get()
  if (!existing.empty) {
    return { collection: Collections.CATEGORIES, action: 'skip (already seeded)', docs: await countCollection(Collections.CATEGORIES) }
  }

  const batch = db.batch()
  for (const [index, cat] of DEFAULT_CATEGORIES.entries()) {
    batch.set(col.doc(cat.id), {
      name: cat.name,
      slug: cat.slug,
      description: '',
      iconName: cat.iconName,
      color: cat.color,
      order: index,
      isActive: true,
      postsCount: 0,
      createdAt: now,
    })
  }
  await batch.commit()
  return { collection: Collections.CATEGORIES, action: `seeded ${DEFAULT_CATEGORIES.length}`, docs: await countCollection(Collections.CATEGORIES) }
}

async function maybeSyncEvents() {
  if (!process.argv.includes('--sync-events')) return null

  const secret =
    process.env.EVENTS_SYNC_SECRET?.trim() || process.env.CRON_SECRET?.trim()
  const baseUrl = (
    process.env.EVENTS_SYNC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')

  if (!secret) {
    console.warn('  --sync-events skipped: missing EVENTS_SYNC_SECRET or CRON_SECRET')
    return null
  }

  const url = `${baseUrl}/api/events/sync`
  console.log(`  POST ${url}`)
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
    console.warn('  event sync failed:', res.status, json)
    return { sync: 'failed', status: res.status, body: json }
  }
  console.log('  event sync ok:', JSON.stringify(json))
  return { sync: 'ok', body: json }
}

console.log(`Project: ${serviceAccount.projectId}`)
console.log('Initializing Firestore collections…\n')

// categories — real seed data (admin panel + feed filters)
results.push(await seedCategories())

// events — placeholder until sync-events populates real docs
const eventsCountBefore = await countCollection(Collections.EVENTS)
if (eventsCountBefore === 0) {
  results.push(
    await ensureInitDoc(Collections.EVENTS, {
      title: '[Init] Events collection',
      description:
        'Placeholder document. Run `npm run sync-events` (with dev server or prod URL) to scrape Biletix/Bubilet/Biletino into this collection. Safe to delete once real events exist.',
      category: 'other',
      city: 'İstanbul',
      citySlug: 'istanbul',
      venue: '—',
      startsAt: now,
      status: 'draft',
      timelineStatus: 'past',
      source: 'init-script',
    })
  )
} else {
  results.push({ collection: Collections.EVENTS, action: 'skip (has data)', docs: eventsCountBefore })
}

// newsDrafts — placeholder; cron ingest creates real drafts
results.push(
  await ensureInitDoc(Collections.NEWS_DRAFTS, {
    title: '[Init] News drafts collection',
    status: 'draft',
    purpose:
      'AI-ingested RSS drafts awaiting admin approval. Created by `npm run ingest-news` / Vercel cron. Published items move to `news`. Safe to delete.',
    source: 'init-script',
  })
)

// conversations — placeholder; real docs created when users message
results.push(
  await ensureInitDoc(Collections.CONVERSATIONS, {
    participantIds: ['__placeholder__'],
    purpose:
      'Direct-message threads. Real conversations are created when users send messages. Subcollection `messages` holds chat history. Safe to delete.',
    lastMessageAt: now,
    unreadCount: 0,
  })
)

// posts — readme only: primary user/video feed content lives in `news`
results.push(
  await ensureInitDoc(Collections.POSTS, {
    purpose:
      'Legacy mirror for engagement counters (views/shares). Primary feed content — user posts, reels, and published news — lives in the `news` collection (VIDEO_FEED_COLLECTION). New content should be written to `news`. Safe to delete.',
    note: 'See src/lib/firebase/firestore.ts VIDEO_FEED_COLLECTION',
  })
)

// reports — intentionally skipped (created when users report content)
results.push({
  collection: Collections.REPORTS,
  action: 'skipped (created on user report)',
  docs: await countCollection(Collections.REPORTS),
})

// cities — not a Firestore collection (static list in src/constants/cities.ts)
results.push({
  collection: 'cities',
  action: 'not used — provinces are in src/constants/cities.ts; events carry citySlug',
  docs: 0,
})

const syncResult = await maybeSyncEvents()
if (syncResult) {
  const eventsAfter = await countCollection(Collections.EVENTS)
  const eventsRow = results.find((r) => r.collection === Collections.EVENTS)
  if (eventsRow) eventsRow.docs = eventsAfter
  if (syncResult.sync === 'ok' && eventsAfter > 1) {
    eventsRow.action = 'populated via sync-events'
    // Remove placeholder if real events arrived
    const initRef = db.collection(Collections.EVENTS).doc(INIT_DOC_ID)
    const initSnap = await initRef.get()
    if (initSnap.exists && initSnap.data()?._placeholder) {
      await initRef.delete()
      eventsRow.docs = await countCollection(Collections.EVENTS)
      eventsRow.note = 'removed _init placeholder after sync'
    }
  }
}

console.log('\nSummary:')
console.log('─'.repeat(72))
for (const row of results) {
  const docs = row.docs !== undefined ? String(row.docs).padStart(5) : '    —'
  console.log(`  ${row.collection.padEnd(16)} ${docs} docs  ${row.action}${row.note ? ` (${row.note})` : ''}`)
}
console.log('─'.repeat(72))

console.log(`
Storage vs Firestore:
  • npm run init-storage  → Firebase Storage paths (events/, posts/) — NOT Firestore
  • npm run init-firestore → Firestore collections (this script)

Populate real data:
  • npm run sync-events   → events (needs EVENTS_SYNC_SECRET + running app)
  • npm run ingest-news   → newsDrafts → news (needs CRON_SECRET + running app)

Collections already visible (you had data): users, news, comments, likes, saved, follows, notifications
`)
