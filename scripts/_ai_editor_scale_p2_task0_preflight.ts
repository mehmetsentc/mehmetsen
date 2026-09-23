/**
 * SCALE P2 TASK 0 — GET only. Cost / volume preflight. No writes.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_scale_p2_task0_preflight.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore, type Query } from 'firebase-admin/firestore'
import { TURKISH_PROVINCES } from '../src/constants/cities'
import { PROVINCE_DISTRICTS } from '../src/constants/turkishDistricts'
import { CITY_CATEGORY_DESK_IDS } from '../src/lib/ai/editorial/seedCityCategoryEditors'
import { COUNTRY_EDITOR_CATEGORY_KEYS } from '../src/lib/ai/editorial/seedCountryEditors'

const ROOT = process.cwd()
for (const path of [join(ROOT, '.env.local'), '/Users/user/nahaber/.env.local']) {
  if (!existsSync(path)) continue
  const text = readFileSync(path, 'utf8')
  let i = 0
  while (i < text.length) {
    if (text[i] === '#' || text[i] === '\n') {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl + 1
      continue
    }
    const eq = text.indexOf('=', i)
    if (eq === -1) break
    const key = text.slice(i, eq).trim()
    if (!key || key.includes('\n')) {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl + 1
      continue
    }
    let j = eq + 1
    let value = ''
    if (text[j] === '"' || text[j] === "'") {
      const q = text[j]!
      j += 1
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) {
          const n = text[j + 1]!
          value += n === 'n' ? '\n' : n === 't' ? '\t' : n === q ? q : n
          j += 2
          continue
        }
        if (text[j] === q) {
          j += 1
          break
        }
        value += text[j]
        j += 1
      }
    } else {
      const nl = text.indexOf('\n', j)
      const end = nl === -1 ? text.length : nl
      value = text.slice(j, end).trim()
      j = end
    }
    if (process.env[key] === undefined) process.env[key] = value
    const nl = text.indexOf('\n', j)
    i = nl === -1 ? text.length : nl + 1
  }
}

function sa() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  if (!projectId || !clientEmail || !privateKey) throw new Error('FIREBASE_ADMIN_* missing')
  return { projectId, clientEmail, privateKey }
}

async function countQuery(
  db: Firestore,
  col: string,
  field: string,
  start: number,
  end?: number
): Promise<number | null> {
  try {
    let q: Query = db.collection(col).where(field, '>=', start)
    if (end != null) q = q.where(field, '<', end)
    const snap = await q.count().get()
    return snap.data().count
  } catch {
    return null
  }
}

async function main() {
  const cred = sa()
  if (!getApps().length) initializeApp({ credential: cert(cred), projectId: cred.projectId })
  const db = getFirestore()
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const todayStart = now - day
  const weekStart = now - 7 * day
  const ninetyStart = now - 90 * day

  const existingEditors = await db.collection('aiEditors').count().get()
  const usageToday =
    (await countQuery(db, 'aiUsageEvents', 'createdAt', todayStart, now)) ??
    (await countQuery(db, 'aiUsageEvents', 'timestamp', todayStart, now))
  const usage7d =
    (await countQuery(db, 'aiUsageEvents', 'createdAt', weekStart, now)) ??
    (await countQuery(db, 'aiUsageEvents', 'timestamp', weekStart, now))

  let usageErrorsToday: number | null = null
  try {
    const errSnap = await db
      .collection('aiUsageEvents')
      .where('createdAt', '>=', todayStart)
      .where('success', '==', false)
      .count()
      .get()
    usageErrorsToday = errSnap.data().count
  } catch {
    usageErrorsToday = null
  }

  const newsToday =
    (await countQuery(db, 'news', 'publishedAt', todayStart, now)) ??
    (await countQuery(db, 'news', 'createdAt', todayStart, now))

  const countryCounts: Record<string, number> = {}
  let scannedNews = 0
  try {
    const newsSnap = await db
      .collection('news')
      .where('categoryId', '==', 'dunya')
      .where('publishedAt', '>=', ninetyStart)
      .select('countrySlug', 'country')
      .limit(2000)
      .get()
    scannedNews = newsSnap.size
    for (const doc of newsSnap.docs) {
      const d = doc.data() as { countrySlug?: string; country?: string }
      const slug = (d.countrySlug || '').trim().toLowerCase()
      if (!slug || slug === 'turkiye' || slug === 'tr') continue
      countryCounts[slug] = (countryCounts[slug] ?? 0) + 1
    }
  } catch (err) {
    try {
      const newsSnap = await db.collection('news').where('categoryId', '==', 'dunya').limit(1500).get()
      scannedNews = newsSnap.size
      for (const doc of newsSnap.docs) {
        const d = doc.data() as { countrySlug?: string; publishedAt?: number; createdAt?: number }
        const t = typeof d.publishedAt === 'number' ? d.publishedAt : d.createdAt
        if (typeof t === 'number' && t < ninetyStart) continue
        const slug = (d.countrySlug || '').trim().toLowerCase()
        if (!slug || slug === 'turkiye' || slug === 'tr') continue
        countryCounts[slug] = (countryCounts[slug] ?? 0) + 1
      }
    } catch {
      scannedNews = -1
    }
  }

  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  const districtCount = Object.values(PROVINCE_DISTRICTS).reduce((n, list) => n + list.length, 0)
  const wave0 = 20
  const wave1 = (TURKISH_PROVINCES.length - 2) * CITY_CATEGORY_DESK_IDS.length // skip Çanakkale+Antalya already in W0
  const wave1IfAll81 = TURKISH_PROVINCES.length * CITY_CATEGORY_DESK_IDS.length
  const wave2 = districtCount
  const wave3 = 15 * COUNTRY_EDITOR_CATEGORY_KEYS.length
  const editors = wave0 + wave1 + wave2 + wave3
  const docsPerEditor = 5 // editor + user + core + news + review
  const writes = editors * docsPerEditor + 1 // + circuit breaker config
  const firestoreWriteUsd = (writes / 100_000) * 0.18
  const seedReads = editors * 2
  const firestoreReadUsd = (seedReads / 100_000) * 0.06

  const naiveDailyCalls = editors * 3
  const avgDailyUsage = usage7d != null ? Math.round(usage7d / 7) : usageToday
  const ratio =
    avgDailyUsage && avgDailyUsage > 0 && naiveDailyCalls ? naiveDailyCalls / avgDailyUsage : null

  const payload = {
    readOnly: true,
    projectId: cred.projectId,
    queriedAt: new Date().toISOString(),
    existingAiEditors: existingEditors.data().count,
    usageToday,
    usage7d,
    usageErrorsToday,
    newsToday,
    dunyaScanned: scannedNews,
    topCountries,
    planned: {
      wave0,
      wave1SkipPilotCities: wave1,
      wave1IfAll81,
      wave2,
      wave3,
      editors,
      docsPerEditor,
      writes,
      seedReads,
      firestoreWriteUsd,
      firestoreReadUsd,
      naiveDailyCallsIfEveryEditorHitsCap: naiveDailyCalls,
      avgDailyUsage,
      naiveVsCurrentRatio: ratio,
    },
    stopIfNaiveGt2x: ratio != null && ratio > 2,
  }

  const out = join(ROOT, 'audit/faz-AI-EDITOR-SCALE-P2-task0-preflight.json')
  writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8')
  console.log(JSON.stringify(payload.planned, null, 2))
  console.log('wrote', out)
}

void main()
