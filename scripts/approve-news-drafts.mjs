#!/usr/bin/env node
/**
 * Dev trial helper: approve all pending_review newsDrafts → published `news` docs.
 *
 * Usage:
 *   npm run approve-news-drafts
 *   node scripts/approve-news-drafts.mjs --limit 3
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const root = process.cwd()
const Collections = { NEWS: 'news', NEWS_DRAFTS: 'newsDrafts' }

const TR_MAP = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
}

function slugifyNewsTitle(title) {
  const normalized = title
    .trim()
    .split('')
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized.slice(0, 80) || 'haber'
}

function buildNewsSlug(title, suffix) {
  const base = slugifyNewsTitle(title)
  if (!suffix) return base
  const clean = suffix.replace(/[^a-z0-9-]/gi, '').slice(0, 12)
  return clean ? `${base}-${clean}` : base
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

const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : null

async function slugTaken(slug, excludeId) {
  const snap = await db.collection(Collections.NEWS).where('slug', '==', slug).limit(2).get()
  return snap.docs.some((d) => d.id !== excludeId)
}

async function allocateUniqueSlug(title, draftId) {
  let candidate = buildNewsSlug(title)
  if (!(await slugTaken(candidate))) return candidate
  for (let i = 2; i <= 20; i++) {
    candidate = buildNewsSlug(title, String(i))
    if (!(await slugTaken(candidate))) return candidate
  }
  return buildNewsSlug(title, draftId.slice(0, 8))
}

function draftToPublishedNews(draft, slug, now) {
  return {
    title: draft.title,
    description: draft.description,
    author: draft.author,
    authorId: draft.authorId,
    thumbnail: draft.thumbnail,
    videoUrl: draft.videoUrl,
    category: draft.category,
    categoryId: draft.categoryId,
    city: draft.city,
    district: draft.district ?? '',
    citySlug: draft.citySlug,
    country: draft.country ?? 'Türkiye',
    location: draft.location,
    tags: draft.tags,
    type: draft.type,
    source: draft.source,
    slug,
    status: 'published',
    aiGenerated: draft.aiGenerated,
    rssFingerprint: draft.rssFingerprint,
    rssGuid: draft.rssGuid,
    sourceUrl: draft.sourceUrl,
    ingestionSourceId: draft.ingestionSourceId,
    sourceLabel: draft.sourceLabel,
    originalTitle: draft.originalTitle,
    ingestedAt: draft.ingestedAt,
    sourcePublishedAt: draft.sourcePublishedAt ?? null,
    createdAt: draft.createdAt,
    updatedAt: now,
    publishedAt: now,
    viewsCount: 0,
    likesCount: 0,
    commentCount: 0,
    savesCount: 0,
    sharesCount: 0,
  }
}

async function approveDraft(draftId, draft) {
  const now = Date.now()
  const slug = await allocateUniqueSlug(draft.title, draftId)
  const newsRef = await db.collection(Collections.NEWS).add(draftToPublishedNews(draft, slug, now))
  await db.collection(Collections.NEWS_DRAFTS).doc(draftId).update({
    draftStatus: 'approved',
    approvedNewsId: newsRef.id,
    approvedSlug: slug,
    updatedAt: now,
  })
  return { newsId: newsRef.id, slug, title: draft.title }
}

const snap = await db
  .collection(Collections.NEWS_DRAFTS)
  .where('draftStatus', '==', 'pending_review')
  .orderBy('createdAt', 'desc')
  .limit(limit ?? 50)
  .get()

if (snap.empty) {
  console.log('No pending_review drafts found.')
  process.exit(0)
}

const results = []
for (const doc of snap.docs) {
  try {
    const result = await approveDraft(doc.id, doc.data())
    results.push(result)
    console.log(`✓ ${result.title} → /haber/${result.slug}`)
  } catch (error) {
    console.error(`✗ ${doc.id}:`, error instanceof Error ? error.message : error)
  }
}

console.log(`\nApproved ${results.length} draft(s).`)
console.log(JSON.stringify(results, null, 2))
