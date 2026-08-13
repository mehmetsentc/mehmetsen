#!/usr/bin/env node
/**
 * Clear city ownership on national gastronomi articles so /yerel/{city}
 * is not flooded by recipes tagged with a province (e.g. Ağrı tarhana).
 *
 * Safe scope:
 * - categoryId === 'gastronomi' with citySlug/city set → strip geo + demote featured
 * - categoryId === 'yerel-gastronomi' with recipe tags (yemek/mutfak/tarif) →
 *   remap to gastronomi + strip geo (misclassified RSS recipes)
 *
 * Usage:
 *   node scripts/backfill-gastronomi-clear-city.mjs
 *   node scripts/backfill-gastronomi-clear-city.mjs --dry-run
 *   node scripts/backfill-gastronomi-clear-city.mjs --city=agri
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
const dryRun = process.argv.includes('--dry-run')
const cityArg = process.argv.find((a) => a.startsWith('--city='))
const onlyCity = cityArg ? cityArg.slice('--city='.length).trim().toLowerCase() : null

const RECIPE_TAG_HINTS = new Set(['yemek', 'mutfak', 'tarif', 'gastronomi', 'food'])

function hasRecipeTags(tags) {
  if (!Array.isArray(tags)) return false
  return tags.some((t) => RECIPE_TAG_HINTS.has(String(t).trim().toLowerCase()))
}

function needsStrip(data) {
  const cat = String(data.categoryId || data.category || '')
    .trim()
    .toLowerCase()
  const citySlug = String(data.citySlug || '')
    .trim()
    .toLowerCase()
  const city = String(data.city || data.location?.city || '').trim()
  const hasGeo = Boolean(citySlug || city)
  const featured = data.featured === true || data.isEditorPick === true

  if (onlyCity && citySlug && citySlug !== onlyCity) return null

  if (cat === 'gastronomi' && (hasGeo || featured)) {
    return { remapCategory: false, reason: hasGeo ? 'gastronomi+city' : 'gastronomi+featured' }
  }

  if (cat === 'yerel-gastronomi' && hasRecipeTags(data.tags) && hasGeo) {
    return { remapCategory: true, reason: 'yerel-gastronomi+recipe-tags' }
  }

  return null
}

function buildUpdate(data, plan) {
  const update = {
    citySlug: '',
    city: '',
    district: '',
    districtSlug: '',
    featured: false,
    isEditorPick: false,
    featuredAt: null,
    isBreaking: false,
    updatedAt: Date.now(),
    gastronomyCityBackfillAt: Date.now(),
  }

  if (plan.remapCategory) {
    update.categoryId = 'gastronomi'
    update.category = 'gastronomi'
  }

  if (data.location && typeof data.location === 'object') {
    update.location = {
      ...data.location,
      city: '',
      district: admin.firestore.FieldValue.delete(),
    }
  }

  return update
}

async function scanCategory(categoryId) {
  const snap = await db.collection('news').where('categoryId', '==', categoryId).get()
  return snap.docs
}

const docs = [
  ...(await scanCategory('gastronomi')),
  ...(await scanCategory('yerel-gastronomi')),
]

let scanned = 0
let updated = 0
const reasons = {}

for (const doc of docs) {
  scanned += 1
  const data = doc.data()
  const plan = needsStrip(data)
  if (!plan) continue

  reasons[plan.reason] = (reasons[plan.reason] || 0) + 1
  const update = buildUpdate(data, plan)

  if (dryRun) {
    console.log('dry-run', doc.id, plan.reason, {
      title: String(data.title || '').slice(0, 80),
      citySlug: data.citySlug || null,
      categoryId: data.categoryId,
    })
    updated += 1
    continue
  }

  await doc.ref.set(update, { merge: true })
  updated += 1
  if (updated % 25 === 0) {
    console.log('progress', { updated, scanned })
  }
}

console.log('Done', {
  dryRun,
  onlyCity,
  scanned,
  updated,
  reasons,
})
