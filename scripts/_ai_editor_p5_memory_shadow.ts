/**
 * P5 Track B2 — expanded SHADOW sample for yerel-eskisehir.
 * Passes articleId so self-match is excluded. Zero prompt injection. Zero writes.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_p5_memory_shadow.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Timestamp } from 'firebase-admin/firestore'
import { loadP4Env } from './_p4_load_env'
import { getAiEditorBySlug, listAiEditors } from '../src/lib/ai/editorial/aiEditorService'
import { retrieveHistoricalContext } from '../src/services/editorial/editorialMemoryRetrieval'
import { isEditorialMemoryInjectionEnabled } from '../src/services/editorial/editorialMemoryMode'
import { getDb, hasDatabaseUrl } from '../src/db'
import { news } from '../src/db/schema/news'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { Collections } from '../src/lib/firebase/collections'

loadP4Env()
process.env.EDITORIAL_MEMORY_MODE = 'SHADOW'

const PILOT_SLUG = 'yerel-eskisehir'
const NOW = Date.now()
const HOUR = 3_600_000
const TARGET = 15

type WindowId = '0-2d' | '2-7d' | '8-30d' | '1-3mo' | '3-12mo' | 'other'

type QueryArticle = {
  id: string
  slug: string
  title: string
  summary: string | null
  citySlug: string | null
  categoryId: string | null
  publishedAt: Date | null
  queryWindow: WindowId
  source: 'postgres' | 'firestore'
}

function initAdmin() {
  if (getApps().length) return getFirestore()
  const sa = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!.trim(),
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!.trim(),
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n').trim(),
  }
  initializeApp({ credential: cert(sa), projectId: sa.projectId })
  return getFirestore()
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const ts = value as Timestamp
  if (typeof ts.toDate === 'function') return ts.toDate()
  return null
}

function windowFor(publishedAt: Date | null): WindowId {
  if (!publishedAt) return 'other'
  const hoursAgo = (NOW - publishedAt.getTime()) / HOUR
  if (hoursAgo < 48) return '0-2d'
  if (hoursAgo < 24 * 7) return '2-7d'
  if (hoursAgo < 24 * 30) return '8-30d'
  if (hoursAgo < 24 * 90) return '1-3mo'
  if (hoursAgo < 24 * 365) return '3-12mo'
  return 'other'
}

async function pgCorpusCounts() {
  if (!hasDatabaseUrl()) return { available: false as const, buckets: [] as { label: string; n: number }[] }
  const db = getDb()
  const windows: [string, number, number | null][] = [
    ['0-2d', 0, 48],
    ['2-7d', 48, 24 * 7],
    ['8-30d', 24 * 7, 24 * 30],
    ['1-3mo', 24 * 30, 24 * 90],
    ['3-12mo', 24 * 90, 24 * 365],
  ]
  const buckets = []
  for (const [label, minH, maxH] of windows) {
    const upper = new Date(NOW - minH * HOUR)
    const conds = [eq(news.status, 'published'), lt(news.publishedAt, upper)]
    if (maxH != null) conds.push(gte(news.publishedAt, new Date(NOW - maxH * HOUR)))
    const rows = await db.select({ n: sql<number>`count(*)::int` }).from(news).where(and(...conds))
    const esk = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(news)
      .where(and(...conds, eq(news.citySlug, 'eskisehir')))
    buckets.push({
      label,
      published: Number(rows[0]?.n ?? 0),
      eskisehir: Number(esk[0]?.n ?? 0),
    })
  }
  return { available: true as const, buckets }
}

async function pickPgQueries(): Promise<QueryArticle[]> {
  if (!hasDatabaseUrl()) return []
  const rows = await getDb()
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      summary: news.summary,
      citySlug: news.citySlug,
      categoryId: news.categoryId,
      publishedAt: news.publishedAt,
    })
    .from(news)
    .where(eq(news.status, 'published'))
    .orderBy(desc(news.publishedAt))
    .limit(40)
  return rows
    .filter((row) => row.title?.trim())
    .map((row) => ({
      ...row,
      queryWindow: windowFor(row.publishedAt),
      source: 'postgres' as const,
    }))
}

async function pickFirestoreQueries(needed: number): Promise<QueryArticle[]> {
  const db = initAdmin()
  const out: QueryArticle[] = []
  const seen = new Set<string>()

  const pushSnap = (snap: FirebaseFirestore.QuerySnapshot) => {
    for (const doc of snap.docs) {
      if (out.length >= needed) return
      const data = doc.data() as Record<string, unknown>
      const title = typeof data.title === 'string' ? data.title.trim() : ''
      if (!title || seen.has(title.toLocaleLowerCase('tr-TR'))) continue
      seen.add(title.toLocaleLowerCase('tr-TR'))
      const publishedAt = toDate(data.publishedAt)
      out.push({
        id: doc.id,
        slug: typeof data.slug === 'string' ? data.slug : doc.id,
        title,
        summary: typeof data.summary === 'string' ? data.summary : null,
        citySlug: typeof data.citySlug === 'string' ? data.citySlug : null,
        categoryId:
          typeof data.categoryId === 'string'
            ? data.categoryId
            : typeof data.category === 'string'
              ? data.category
              : null,
        publishedAt,
        queryWindow: windowFor(publishedAt),
        source: 'firestore',
      })
    }
  }

  const ranges: { label: string; start: Date; end: Date }[] = [
    { label: '2-7d', start: new Date(NOW - 24 * 7 * HOUR), end: new Date(NOW - 48 * HOUR) },
    { label: '1-3mo', start: new Date(NOW - 24 * 90 * HOUR), end: new Date(NOW - 24 * 30 * HOUR) },
    { label: '8-30d', start: new Date(NOW - 24 * 30 * HOUR), end: new Date(NOW - 24 * 7 * HOUR) },
  ]

  for (const citySlug of ['eskisehir', null] as const) {
    for (const range of ranges) {
      if (out.length >= needed) break
      try {
        let q: FirebaseFirestore.Query = db
          .collection(Collections.NEWS)
          .where('status', '==', 'published')
          .where('publishedAt', '>=', range.start)
          .where('publishedAt', '<', range.end)
        if (citySlug) q = q.where('citySlug', '==', citySlug)
        const snap = await q.orderBy('publishedAt', 'desc').limit(30).get()
        pushSnap(snap)
      } catch (err) {
        console.warn(
          `[p5-shadow] ${range.label} ${citySlug ?? 'any'} query failed:`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  if (out.length < needed) {
    try {
      const recent = await db
        .collection(Collections.NEWS)
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(80)
        .get()
      pushSnap(recent)
    } catch (err) {
      console.warn('[p5-shadow] recent firestore query failed:', err instanceof Error ? err.message : err)
      const fallback = await db.collection(Collections.NEWS).where('status', '==', 'published').limit(80).get()
      pushSnap(fallback)
    }
  }
  return out
}

function flagPossiblyRelated(results: Awaited<ReturnType<typeof retrieveHistoricalContext>>['results']) {
  return results
    .filter((r) => r.relationshipConfidence === 'POSSIBLY_RELATED')
    .map((r) => {
      const tags = r.evidence.map((e) => e.tag)
      const singleEvidence = tags.length === 1
      return {
        headline: r.headline,
        articleId: r.articleId,
        ageBucket: r.ageBucket,
        evidenceTags: tags,
        singleEvidence,
        singleEvidenceTag: singleEvidence ? tags[0] : null,
        sharedTopicTokenOnly: singleEvidence && tags[0] === 'SHARED_TOPIC_TOKEN',
        needsHumanLabel: true,
      }
    })
}

function preferForTarget(queries: QueryArticle[]): QueryArticle[] {
  const quotas: Partial<Record<WindowId, number>> = { '2-7d': 6, '1-3mo': 6, '8-30d': 3 }
  const used = new Set<string>()
  const picked: QueryArticle[] = []

  const take = (pool: QueryArticle[], n: number) => {
    for (const q of pool) {
      if (picked.length >= TARGET || n <= 0) return
      const key = q.title.toLocaleLowerCase('tr-TR')
      if (used.has(key)) continue
      used.add(key)
      picked.push(q)
      n -= 1
    }
  }

  const byCityThenSource = (a: QueryArticle, b: QueryArticle) => {
    const city = Number(b.citySlug === 'eskisehir') - Number(a.citySlug === 'eskisehir')
    if (city !== 0) return city
    return Number(a.source === 'postgres') - Number(b.source === 'postgres')
  }

  for (const [window, n] of Object.entries(quotas) as [WindowId, number][]) {
    take(queries.filter((q) => q.queryWindow === window).sort(byCityThenSource), n)
  }
  take([...queries].sort(byCityThenSource), TARGET - picked.length)
  return picked
}

async function main() {
  const injectionEnabled = isEditorialMemoryInjectionEnabled()
  if (injectionEnabled) {
    throw new Error('isEditorialMemoryInjectionEnabled() must stay false')
  }

  const pick = await getAiEditorBySlug(PILOT_SLUG)
  if (!pick) throw new Error(`Pilot ${PILOT_SLUG} not found`)

  const othersOn = (await listAiEditors({ status: 'active', limit: 4000 })).filter(
    (e) => e.id !== pick.id && e.capabilities?.memoryEnabled === true && e.personaType === 'local_editor'
  )

  const corpus = await pgCorpusCounts()
  const pgQueries = await pickPgQueries()
  const firestoreQueries = await pickFirestoreQueries(TARGET * 3)
  const queries = preferForTarget([...pgQueries, ...firestoreQueries])

  const samples = []
  for (const item of queries) {
    const result = await retrieveHistoricalContext(
      {
        headline: item.title,
        summary: item.summary,
        citySlug: item.citySlug || pick.citySlug,
        categoryId: item.categoryId,
        articleId: item.id,
        slug: item.slug,
        publishedAt: new Date().toISOString(),
      },
      { editorId: pick.id, citySlug: pick.citySlug, managedCategories: pick.managedCategories }
    )
    const selfInResults = result.results.some((r) => r.articleId === item.id)
    samples.push({
      queryWindow: item.queryWindow,
      querySource: item.source,
      articleId: item.id,
      slug: item.slug,
      headline: item.title,
      citySlug: item.citySlug,
      categoryId: item.categoryId,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      selfMatchPresent: selfInResults,
      noResultReason: result.noResultReason ?? null,
      candidatesConsideredByBucket: result.candidatesConsideredByBucket ?? null,
      resultAgeBuckets: result.results.map((r) => r.ageBucket),
      possiblyRelatedFlags: flagPossiblyRelated(result.results),
      results: result.results.map((r) => ({
        articleId: r.articleId,
        headline: r.headline,
        publishedAt: r.publishedAt,
        trustTier: r.trustTier,
        publicReadClass: r.publicReadClass,
        relationshipConfidence: r.relationshipConfidence,
        evidence: r.evidence.map((e) => e.tag),
        retrievalScore: r.retrievalScore,
        ageBucket: r.ageBucket,
      })),
    })
  }

  const possiblyRelated = samples.flatMap((s) =>
    s.possiblyRelatedFlags.map((flag) => ({
      queryHeadline: s.headline,
      queryWindow: s.queryWindow,
      querySource: s.querySource,
      ...flag,
    }))
  )

  const report = {
    generatedAt: new Date().toISOString(),
    editorialMemoryMode: process.env.EDITORIAL_MEMORY_MODE,
    injectionEnabled,
    writeFunctionInvoked: false,
    pgMemoryCorpus: corpus,
    noteTr:
      'Aday havuzu PostgreSQL canonical `news`. Bu ortamda 2-7g penceresinde published satır yok; 2-7g bucket sonucu bu yüzden boş kalabilir. 10-15 sorgu için Firestore published başlıklar da kullanıldı (salt okunur).',
    pilot: {
      id: pick.id,
      slug: pick.slug,
      name: pick.name,
      citySlug: pick.citySlug,
      memoryEnabled: pick.capabilities.memoryEnabled === true,
      otherLocalMemoryEnabled: othersOn.map((e) => e.slug),
    },
    queryCount: samples.length,
    queryWindowCounts: samples.reduce(
      (acc, s) => {
        acc[s.queryWindow] = (acc[s.queryWindow] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    ),
    selfMatchCount: samples.filter((s) => s.selfMatchPresent).length,
    ageBucketHitCounts: samples.reduce(
      (acc, s) => {
        for (const bucket of s.resultAgeBuckets) {
          acc[bucket] = (acc[bucket] ?? 0) + 1
        }
        return acc
      },
      {} as Record<string, number>
    ),
    possiblyRelatedCount: possiblyRelated.length,
    possiblyRelatedSingleEvidence: possiblyRelated.filter((p) => p.singleEvidence),
    possiblyRelatedSharedTopicTokenOnly: possiblyRelated.filter((p) => p.sharedTopicTokenOnly),
    possiblyRelated,
    samples,
  }

  const outArg = process.argv.find((a) => a.startsWith('--out='))
  const out = join(process.cwd(), outArg ? outArg.slice('--out='.length) : 'audit/faz-P5-memory-shadow-sample.json')
  writeFileSync(out, JSON.stringify(report, null, 2), 'utf8')
  console.log(
    JSON.stringify(
      {
        wrote: out,
        queryCount: report.queryCount,
        queryWindowCounts: report.queryWindowCounts,
        selfMatchCount: report.selfMatchCount,
        ageBucketHitCounts: report.ageBucketHitCounts,
        possiblyRelatedCount: report.possiblyRelatedCount,
        sharedTopicTokenOnly: report.possiblyRelatedSharedTopicTokenOnly.length,
        pgCorpus: corpus,
        injectionEnabled,
        otherLocalMemoryEnabled: report.pilot.otherLocalMemoryEnabled,
      },
      null,
      2
    )
  )
}

void main()
