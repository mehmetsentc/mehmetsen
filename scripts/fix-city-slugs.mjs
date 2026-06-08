#!/usr/bin/env node
/**
 * Repair legacy broken citySlug values on published news + pending drafts.
 *
 * Usage:
 *   node scripts/fix-city-slugs.mjs
 *   node scripts/fix-city-slugs.mjs --dry-run
 *   node scripts/fix-city-slugs.mjs --limit=100
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const root = process.cwd()
const Collections = { NEWS: 'news', NEWS_DRAFTS: 'newsDrafts' }

const LEGACY_BROKEN_CITY_SLUGS = {
  'ad-yaman': 'adiyaman',
  agr: 'agri',
  'ayd-n': 'aydin',
  'bal-kesir': 'balikesir',
  'bart-n': 'bartin',
  'cank-r': 'cankiri',
  'diyarbak-r': 'diyarbakir',
  'elaz-g': 'elazig',
  'gd-r': 'igdir',
  'k-r-kkale': 'kirikkale',
  'k-rklareli': 'kirklareli',
  'k-rsehir': 'kirsehir',
  'sanl-urfa': 'sanliurfa',
  's-rnak': 'sirnak',
}

function normalizeCitySlug(raw) {
  const slug = String(raw ?? '').trim().toLowerCase()
  if (!slug) return slug
  return LEGACY_BROKEN_CITY_SLUGS[slug] ?? slug
}

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
  console.error('Missing Firebase Admin credentials in .env.local')
  process.exit(1)
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  })
}

const db = getFirestore()
const dryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : null

async function repairCollection(collectionName) {
  let scanned = 0
  let fixed = 0
  const brokenSlugs = Object.keys(LEGACY_BROKEN_CITY_SLUGS)

  for (const brokenSlug of brokenSlugs) {
    if (limit !== null && scanned >= limit) break

    const snap = await db
      .collection(collectionName)
      .where('citySlug', '==', brokenSlug)
      .get()

    for (const doc of snap.docs) {
      if (limit !== null && scanned >= limit) break
      scanned++

      const data = doc.data()
      const nextSlug = normalizeCitySlug(data.citySlug)
      if (!nextSlug || nextSlug === data.citySlug) continue

      const patch = {
        citySlug: nextSlug,
        updatedAt: Date.now(),
      }

      if (data.category?.startsWith('city:')) {
        patch.category = `city:${nextSlug}`
      }
      if (data.categoryId?.startsWith('city:')) {
        patch.categoryId = `city:${nextSlug}`
      }
      if (data.location?.city && typeof data.location.city === 'string') {
        patch.location = { ...data.location }
      }

      console.log(
        `${dryRun ? '[dry-run] ' : ''}${collectionName}/${doc.id}: ${data.citySlug} -> ${nextSlug}`
      )

      if (!dryRun) {
        await doc.ref.update(patch)
      }
      fixed++
    }
  }

  return { scanned, fixed }
}

async function main() {
  console.log(`Repairing legacy citySlug values${dryRun ? ' (dry run)' : ''}…`)

  const news = await repairCollection(Collections.NEWS)
  const drafts = await repairCollection(Collections.NEWS_DRAFTS)

  console.log(
    JSON.stringify(
      {
        dryRun,
        news,
        drafts,
        totalFixed: news.fixed + drafts.fixed,
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
