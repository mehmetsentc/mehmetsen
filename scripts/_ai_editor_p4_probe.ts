/**
 * P4 Track C1 + B1/B3 — usage-field probe, pick one SHADOW pilot, sample retrieval.
 * Does not inject into prompts. EDITORIAL_MEMORY_MODE stays off unless this process sets SHADOW.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/_ai_editor_p4_probe.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadP4Env } from './_p4_load_env'
import { getAiEditorBySlug, listAiEditors, updateAiEditor } from '../src/lib/ai/editorial/aiEditorService'
import { retrieveHistoricalContext } from '../src/services/editorial/editorialMemoryRetrieval'
import { fetchEditorBestExamples, formatBestExamplesForPrompt } from '../src/lib/ai/editorial/editorBestExamples'
import { getDb, hasDatabaseUrl } from '../src/db'
import { news } from '../src/db/schema/news'
import { desc, eq } from 'drizzle-orm'

loadP4Env()
process.env.EDITORIAL_MEMORY_MODE = process.env.EDITORIAL_MEMORY_MODE || 'SHADOW'

const MEGA = new Set(['istanbul', 'ankara', 'izmir'])
const PREFERRED = ['eskisehir', 'konya', 'samsun', 'gaziantep', 'kayseri', 'denizli', 'mersin', 'bursa']

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

async function probeUsage(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection('aiUsageEvents').orderBy('createdAt', 'desc').limit(250).get()
  let editorId = 0
  let newsId = 0
  let publishScore = 0
  let gateDecision = 0
  let stage4 = 0
  const samples: Record<string, unknown>[] = []
  for (const doc of snap.docs) {
    const row = doc.data() as Record<string, unknown>
    if (row.agentName === 'stage4_gate') stage4 += 1
    if (typeof row.editorId === 'string' && row.editorId.trim()) editorId += 1
    if (typeof row.newsId === 'string' && row.newsId.trim()) newsId += 1
    if (typeof row.publishScore === 'number') publishScore += 1
    if (typeof row.gateDecision === 'string' && row.gateDecision.trim()) gateDecision += 1
    if (samples.length < 6) {
      samples.push({
        agentName: row.agentName ?? null,
        editorId: row.editorId ?? null,
        newsId: row.newsId ?? null,
        publishScore: row.publishScore ?? null,
        gateDecision: row.gateDecision ?? null,
        task: row.task ?? null,
      })
    }
  }
  return {
    scanned: snap.size,
    stage4,
    filled: { editorId, newsId, publishScore, gateDecision },
    samples,
  }
}

async function pickPilot() {
  const editors = await listAiEditors({ status: 'active', limit: 4000 })
  const locals = editors.filter((e) => {
    if (e.personaType !== 'local_editor') return false
    const city = (e.citySlug || '').trim().toLowerCase()
    if (!city || MEGA.has(city)) return false
    if (e.slug.startsWith('ilce-')) return false
    const provinces = e.localConfig?.priorityProvinces ?? e.localConfig?.provinces ?? []
    if (provinces.length > 1) return false
    return true
  })
  const byPref = PREFERRED.map((city) => {
    return (
      locals.find((e) => e.slug === `yerel-${city}`) ||
      locals.find((e) => e.citySlug === city && (e.categoryIds?.includes('yerel-haber') || e.slug.startsWith('yerel-')))
    )
  }).filter(Boolean)
  const pick = byPref[0] || locals.find((e) => e.slug.startsWith('yerel-')) || locals[0]
  return { pick, candidateCount: locals.length, preferredFound: byPref.map((e) => e!.slug) }
}

async function main() {
  const db = initAdmin()
  const usage = await probeUsage(db)
  const { pick, candidateCount, preferredFound } = await pickPilot()
  if (!pick) throw new Error('No local_editor pilot candidate')

  const apply = process.argv.includes('--apply-pilot')
  const already = pick.capabilities?.memoryEnabled === true
  if (apply && !already) {
    await updateAiEditor(
      pick.id,
      { capabilities: { ...pick.capabilities, memoryEnabled: true } },
      'p4-memory-shadow-pilot'
    )
  }
  const after = apply || already ? await getAiEditorBySlug(pick.slug) : pick

  const othersOn = (await listAiEditors({ status: 'active', limit: 4000 })).filter(
    (e) => e.id !== pick.id && e.capabilities?.memoryEnabled === true && e.personaType === 'local_editor'
  )

  const headlines: { title: string; citySlug: string | null; categoryId: string | null }[] = []
  if (hasDatabaseUrl()) {
    const rows = await getDb()
      .select({
        title: news.title,
        citySlug: news.citySlug,
        categoryId: news.categoryId,
      })
      .from(news)
      .where(eq(news.status, 'published'))
      .orderBy(desc(news.publishedAt))
      .limit(8)
    for (const row of rows) {
      if (row.title?.trim()) {
        headlines.push({ title: row.title, citySlug: row.citySlug, categoryId: row.categoryId })
      }
    }
  }
  if (headlines.length === 0) {
    headlines.push({
      title: `${pick.citySlug} belediyesi otobüs seferlerini artırdı`,
      citySlug: pick.citySlug ?? null,
      categoryId: 'yerel-haber',
    })
  }
  const samples = []
  for (const item of headlines.slice(0, 4)) {
    const result = await retrieveHistoricalContext(
      { headline: item.title, citySlug: item.citySlug || pick.citySlug, categoryId: item.categoryId },
      { editorId: pick.id, citySlug: pick.citySlug, managedCategories: pick.managedCategories }
    )
    samples.push({
      headline: item.title,
      noResultReason: result.noResultReason ?? null,
      candidatesConsideredByBucket: result.candidatesConsideredByBucket ?? null,
      results: result.results.map((r) => ({
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

  let bestExamples = null
  let bestBlock = ''
  try {
    bestExamples = await fetchEditorBestExamples(pick.id)
    bestBlock = formatBestExamplesForPrompt(bestExamples)
  } catch (err) {
    bestExamples = { error: err instanceof Error ? err.message : String(err) }
  }

  const report = {
    usage,
    pilot: {
      id: pick.id,
      slug: pick.slug,
      name: pick.name,
      citySlug: pick.citySlug,
      personaType: pick.personaType,
      categoryIds: pick.categoryIds,
      memoryEnabledBefore: already,
      memoryEnabledAfter: after?.capabilities.memoryEnabled === true,
      appliedThisRun: apply,
      reasonTr:
        'Orta ölçekli il yerel masası: mega kent değil, ilçe-genel değil, tek citySlug, dar yerel kategori. Arşiv tekrarlayan kurum/belediye haberine elverişli.',
      candidateCount,
      preferredFound,
      otherLocalMemoryEnabled: othersOn.map((e) => e.slug),
    },
    editorialMemoryMode: process.env.EDITORIAL_MEMORY_MODE,
    injectionEnabled: false,
    shadowSamples: samples,
    bestExamplesPreview: { examples: bestExamples, ifInjectedBlock: bestBlock },
  }
  const out = join(process.cwd(), 'audit/faz-P4-memory-shadow-sample.json')
  writeFileSync(out, JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify({ wrote: out, pilot: report.pilot.slug, usage: report.usage.filled }, null, 2))
}

void main()
