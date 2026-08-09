#!/usr/bin/env node
/**
 * Seed Çanakkale municipal festivals & local events into Firestore `events`.
 *
 * Idempotent upsert by doc id: `canakkale-local_{slug}`
 *
 * Usage:
 *   npm run seed-canakkale-events
 *   npm run seed-canakkale-events -- --posters-only
 *   npm run seed-canakkale-events -- --dry-run
 *
 * Requires Firebase Admin credentials in .env.local (same as init-firestore).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { ensureEventPosters } from './lib/canakkale-event-posters.mjs'
import { resolveAnnualOccurrence, toAnnualDateLabel } from './lib/annual-event-dates.mjs'

const root = process.cwd()
const DATA_FILE = join(root, 'data', 'canakkale-local-events.json')
const SOURCE = 'canakkale-local'

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

function loadEventsData() {
  if (!existsSync(DATA_FILE)) {
    throw new Error(`Missing data file: ${DATA_FILE}`)
  }
  const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  if (!Array.isArray(raw.events) || raw.events.length === 0) {
    throw new Error('No events found in data file')
  }
  return raw
}

function buildFirestoreDoc(event, meta, nowIso) {
  const docId = `${SOURCE}_${event.slug}`
  const templateStart = event.startsAt
  const templateEnd = event.endsAt ?? undefined
  const resolved = resolveAnnualOccurrence(templateStart, templateEnd, new Date(nowIso))
  const startsAt = resolved.startsAt
  const endsAt = resolved.endsAt
  const timelineStatus =
    (endsAt && endsAt >= nowIso) || startsAt >= nowIso ? 'upcoming' : 'past'
  const dateLabel = toAnnualDateLabel(event.dateLabel)

  return {
    id: docId,
    payload: {
      title: event.title,
      description: event.description,
      category: event.category,
      city: meta.city,
      citySlug: meta.citySlug,
      districtSlug: event.districtSlug,
      venue: event.venue,
      address: event.address,
      organizer: event.organizer,
      startsAt,
      endsAt,
      dateLabel,
      recurrence: 'annual',
      coverImageUrl: `/events/canakkale/${event.slug}.png`,
      tags: event.tags,
      isFree: true,
      isPublic: true,
      ticketUrl: '',
      status: 'published',
      timelineStatus,
      source: 'firestore',
      sourceId: event.slug,
      sourceHash: event.slug,
      provider: 'Çanakkale Yerel',
      createdAt: nowIso,
      syncedAt: nowIso,
    },
  }
}

async function seedFirestore(events, meta, dryRun) {
  const serviceAccount = readServiceAccount()
  if (!serviceAccount) {
    console.warn(
      'Firebase Admin credentials not found — skipping Firestore seed.\n' +
        'Set FIREBASE_ADMIN_* or FIREBASE_SERVICE_ACCOUNT_JSON in .env.local'
    )
    return { seeded: 0, skipped: 0, dryRun, firestore: false }
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    })
  }

  const db = getFirestore()
  const nowIso = new Date().toISOString()
  let seeded = 0
  let updated = 0

  for (const event of events) {
    const { id, payload } = buildFirestoreDoc(event, meta, nowIso)
    const ref = db.collection('events').doc(id)
    const existing = await ref.get()

    if (dryRun) {
      console.log(`[dry-run] would upsert ${id}`)
      seeded++
      continue
    }

    if (existing.exists) {
      await ref.set(payload, { merge: true })
      updated++
    } else {
      await ref.set(payload)
      seeded++
    }
  }

  return { seeded, updated, dryRun, firestore: true }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const postersOnly = args.has('--posters-only')
  const forcePosters = args.has('--force-posters')

  const meta = loadEventsData()
  const events = meta.events

  console.log(`Loaded ${events.length} Çanakkale local events from ${DATA_FILE}`)

  if (forcePosters) {
    const { generateEventPoster } = await import('./lib/canakkale-event-posters.mjs')
    const outputDir = join(root, 'public', 'events', 'canakkale')
    for (const event of events) {
      await generateEventPoster(event, outputDir)
    }
    console.log(`Regenerated ${events.length} posters in public/events/canakkale/`)
  } else {
    const posterResult = await ensureEventPosters(events, root)
    console.log(
      `Posters: ${posterResult.created.length} created, ${posterResult.skipped.length} already existed`
    )
    console.log(`Poster directory: ${posterResult.outputDir}`)
  }

  if (postersOnly) {
    console.log('Posters-only mode — skipping Firestore.')
    return
  }

  const result = await seedFirestore(events, meta, dryRun)
  if (result.firestore) {
    console.log(
      dryRun
        ? `Dry run complete — ${result.seeded} events would be upserted`
        : `Firestore seed complete — ${result.seeded} created, ${result.updated} updated`
    )
  }

  console.log('\nRe-run anytime with: npm run seed-canakkale-events')
}

main().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
