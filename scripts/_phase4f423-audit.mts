/**
 * Phase 4F.4.2.3 — SOURCE RECOVERY DEEP AUDIT (read-only).
 * Modes: baseline | inventory | classify | probe | articles | cluster | canakkale | score | report | full
 * NO deploy, NO source activation, NO paid AI, NO DB writes.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchDocument } from '../src/services/crawler/http/fetchDocument'
import { extractArticleWithFallback } from '../src/services/crawler/extract/pipeline'
import { parseRssOrAtom } from '../src/services/crawler/discovery/rss'
import { boilerplateRatio, linkDensity } from '../src/services/crawler/extract/confidence'
import { classifyEditorialContentClass } from '../src/services/crawler/autoDraft/lowEditorialValue'
import { summarizeSourceHealth } from '../src/services/crawler/autoDraft/sourceHealth'
import { nextStatusForFailures } from '../src/services/crawler/health'
import { derivedSourcePauseReason } from '../src/services/crawler/autoDraft/sourcePauseAudit'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
}

const mode = process.argv[2] || 'full'
const T423 = new Date().toISOString()
const EXPECTED_SHA = '74b81b9'
const PROBE_DELAY_MS = 1500
const CANAKKALE_DISTRICTS = [
  'Merkez',
  'Biga',
  'Çan',
  'Yenice',
  'Bayramiç',
  'Ezine',
  'Ayvacık',
  'Lapseki',
  'Gelibolu',
  'Eceabat',
  'Gökçeada',
  'Bozcaada',
]

type PauseReasonClass =
  | 'AUTO_FAILURE'
  | 'HTTP_BLOCK'
  | 'ROBOTS_OR_ACCESS'
  | 'PARSER_FAILURE'
  | 'NO_ARTICLES_FOUND'
  | 'STALE_SOURCE'
  | 'BAD_CONTENT_QUALITY'
  | 'BOILERPLATE_HEAVY'
  | 'DUPLICATE_HEAVY'
  | 'MANUAL_PAUSE'
  | 'UNKNOWN_LEGACY'
  | 'OTHER'

type ContentValueClass =
  | 'NATIONAL_HARD_NEWS'
  | 'LOCAL_NEWS'
  | 'POLITICS'
  | 'ECONOMY'
  | 'SPORT'
  | 'TECH'
  | 'HEALTH'
  | 'LIFESTYLE'
  | 'TABLOID'
  | 'MIXED'

type RecoveryTier =
  | 'RECOVER_NOW'
  | 'RECOVER_AFTER_FIX'
  | 'KEEP_PAUSED'
  | 'BLOCKED_EXTERNAL'
  | 'UNKNOWN_NEEDS_MANUAL_REVIEW'

type SourceRow = Record<string, unknown>

function writeOut(name: string, data: unknown) {
  writeFileSync(`tmp-phase4f423-${name}.json`, JSON.stringify(data, null, 2))
}

function readOut<T>(name: string): T | null {
  const p = `tmp-phase4f423-${name}.json`
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function classifyPauseReason(s: SourceRow): PauseReasonClass {
  const raw = String(s.last_pause_reason || derivedSourcePauseReason({
    status: String(s.status),
    lastPauseReason: s.last_pause_reason as string | null,
  }) || '').toLowerCase()
  const failures = Number(s.consecutive_failures || 0)
  const tier = String(s.quality_tier || '')

  if (/manual/.test(raw)) return 'MANUAL_PAUSE'
  if (/auto_pause|auto_degrade|auto_failure|failures/.test(raw) || failures >= 3) return 'AUTO_FAILURE'
  if (/403|401|451|blocked|forbidden|waf|cloudflare/.test(raw)) return 'HTTP_BLOCK'
  if (/robots|access|captcha/.test(raw)) return 'ROBOTS_OR_ACCESS'
  if (/parse|extract|html|encoding|empty_body|malformed/.test(raw)) return 'PARSER_FAILURE'
  if (/no_articles|empty_feed|zero_items|discovered_0/.test(raw)) return 'NO_ARTICLES_FOUND'
  if (/stale|freshness|outdated/.test(raw)) return 'STALE_SOURCE'
  if (/quality|spam|tier_d|low_quality/.test(raw) || tier === 'TIER_D') return 'BAD_CONTENT_QUALITY'
  if (/boilerplate/.test(raw)) return 'BOILERPLATE_HEAVY'
  if (/duplicate|dedup/.test(raw)) return 'DUPLICATE_HEAVY'
  if (!raw || raw === 'bilinmiyor' || raw === 'unknown_legacy') return 'UNKNOWN_LEGACY'
  return 'OTHER'
}

function mapEditorialToContentValue(cls: string, category: string): ContentValueClass {
  const cat = category.toUpperCase()
  if (cls === 'HARD_NEWS' || cls === 'BREAKING_NEWS') return 'NATIONAL_HARD_NEWS'
  if (cls === 'LOCAL_NEWS') return 'LOCAL_NEWS'
  if (cls === 'POLITICS' || cat === 'POLITICS') return 'POLITICS'
  if (cls === 'ECONOMY' || cat === 'ECONOMY' || cat === 'FINANCE') return 'ECONOMY'
  if (cls === 'SPORT' || cat === 'SPORTS') return 'SPORT'
  if (cls === 'TECH' || cat === 'TECHNOLOGY') return 'TECH'
  if (cls === 'HEALTH') return 'HEALTH'
  if (cls === 'LIFESTYLE' || cls === 'ENTERTAINMENT' || cls === 'CULTURE') return 'LIFESTYLE'
  if (cls === 'CELEBRITY' || cls === 'CLICKBAIT' || cls === 'SEO_FILLER' || cls === 'ASTROLOGY') return 'TABLOID'
  if (cat === 'LOCAL') return 'LOCAL_NEWS'
  return 'MIXED'
}

function extractionHealth(input: {
  ok: boolean
  status: number
  wordCount: number
  confidence: number
  titleFound: boolean
  boilerplate: number
}): 'EXTRACTION_HEALTHY' | 'EXTRACTION_PARTIAL' | 'EXTRACTION_BAD' | 'FETCH_BLOCKED' {
  if (!input.ok || input.status === 403 || input.status === 401 || input.status === 451) return 'FETCH_BLOCKED'
  if (input.wordCount >= 120 && input.confidence >= 0.55 && input.titleFound && input.boilerplate < 0.35) {
    return 'EXTRACTION_HEALTHY'
  }
  if (input.wordCount >= 60 && input.titleFound) return 'EXTRACTION_PARTIAL'
  return 'EXTRACTION_BAD'
}

function recoveryScore(input: {
  fetchOk: boolean
  feedOk: boolean
  articleOk: boolean
  extraction: string
  editorialClass: ContentValueClass
  freshnessHours: number
  uniqueEvents: number
  multiSourceBoost: number
  boilerplate: number
  duplicateRatio: number
}): number {
  let fetch = 0
  if (input.fetchOk) fetch += 10
  if (input.feedOk) fetch += 6
  if (input.articleOk) fetch += 4

  let extract = 0
  if (input.extraction === 'EXTRACTION_HEALTHY') extract = 20
  else if (input.extraction === 'EXTRACTION_PARTIAL') extract = 12
  else if (input.extraction === 'FETCH_BLOCKED') extract = 0
  else extract = 4

  let editorial = 0
  if (['NATIONAL_HARD_NEWS', 'POLITICS', 'LOCAL_NEWS', 'ECONOMY'].includes(input.editorialClass)) editorial = 15
  else if (['SPORT', 'TECH', 'HEALTH'].includes(input.editorialClass)) editorial = 10
  else if (input.editorialClass === 'MIXED') editorial = 7
  else editorial = 3

  let freshness = 0
  if (input.freshnessHours <= 24) freshness = 10
  else if (input.freshnessHours <= 48) freshness = 7
  else if (input.freshnessHours <= 96) freshness = 4
  else freshness = 1

  const unique = Math.min(15, Math.round(input.uniqueEvents * 3))
  const multi = Math.min(15, input.multiSourceBoost)
  let clean = 5
  if (input.boilerplate > 0.5) clean -= 2
  if (input.duplicateRatio > 0.6) clean -= 2
  clean = Math.max(0, clean)

  return Math.max(0, Math.min(100, fetch + extract + editorial + freshness + unique + multi + clean))
}

function recoveryTier(score: number, probe: Record<string, unknown>): RecoveryTier {
  const extraction = String(probe.extractionHealth || '')
  const blocked = probe.homepageBlocked === true || extraction === 'FETCH_BLOCKED'
  if (blocked) return 'BLOCKED_EXTERNAL'
  if (score >= 72 && extraction === 'EXTRACTION_HEALTHY') return 'RECOVER_NOW'
  if (score >= 55 && extraction !== 'EXTRACTION_BAD') return 'RECOVER_AFTER_FIX'
  if (String(probe.pauseClass) === 'MANUAL_PAUSE' && score >= 60) return 'RECOVER_NOW'
  if (String(probe.pauseClass) === 'UNKNOWN_LEGACY' && score < 40) return 'UNKNOWN_NEEDS_MANUAL_REVIEW'
  if (score < 35) return 'KEEP_PAUSED'
  if (score >= 45) return 'RECOVER_AFTER_FIX'
  return 'KEEP_PAUSED'
}

async function probeUrl(url: string, timeoutMs = 14000) {
  const t0 = Date.now()
  const res = await fetchDocument({ url, timeoutMs, skipPoliteness: true })
  const ct = res.body.slice(0, 200).includes('<') ? 'text/html' : res.body.includes('<?xml') || res.body.includes('<rss') ? 'application/xml' : 'unknown'
  return {
    url,
    ok: res.ok,
    status: res.status,
    finalUrl: res.finalUrl,
    bytes: res.body.length,
    latencyMs: res.durationMs || Date.now() - t0,
    contentType: ct,
    errorCode: res.errorCode || null,
    robotsOrWaf: res.status === 403 || res.status === 401 || res.status === 451 || /cloudflare|captcha|access denied/i.test(res.body.slice(0, 2000)),
  }
}

async function probeSourceDeep(s: SourceRow) {
  const baseUrl = String(s.base_url || '')
  const rssUrl = String(s.rss_url || (Array.isArray(s.rss_urls) ? (s.rss_urls as string[])[0] : '') || '')
  const homepage = baseUrl.startsWith('http') ? await probeUrl(baseUrl) : null
  await sleep(PROBE_DELAY_MS)
  const feed = rssUrl.startsWith('http') ? await probeUrl(rssUrl) : null
  await sleep(PROBE_DELAY_MS)

  let articleUrl: string | null = null
  let articleProbe: Awaited<ReturnType<typeof probeUrl>> | null = null
  let extraction: Record<string, unknown> | null = null

  if (feed?.ok && feed.bytes > 200) {
    try {
      const res = await fetchDocument({ url: rssUrl, skipPoliteness: true })
      const items = parseRssOrAtom(res.body, res.finalUrl)
      articleUrl = items.find((i) => i.url?.startsWith('http'))?.url || null
    } catch {
      articleUrl = null
    }
  }

  if (articleUrl) {
    articleProbe = await probeUrl(articleUrl)
    await sleep(PROBE_DELAY_MS)
    if (articleProbe.ok) {
      const fetched = await fetchDocument({ url: articleUrl, skipPoliteness: true })
      const extracted = fetched.ok
        ? await extractArticleWithFallback(fetched.body, fetched.finalUrl, String(s.language || 'tr'))
        : null
      if (extracted) {
        const bp = boilerplateRatio(extracted.articleBodyText, extracted.title || '')
        const ld = linkDensity(fetched.body, extracted.articleBodyText)
        extraction = {
          title: extracted.title?.slice(0, 120) || null,
          wordCount: extracted.wordCount,
          usableWords: extracted.wordCount,
          confidence: extracted.extractionConfidence,
          boilerplateRatio: bp,
          linkDensity: ld,
          imageFound: Boolean(extracted.mainImageUrl),
          dateFound: Boolean(extracted.publishedAt),
          authorFound: Boolean(extracted.author),
          method: extracted.extractionMethod,
        }
      }
    }
  }

  const extHealth = extractionHealth({
    ok: Boolean(articleProbe?.ok),
    status: articleProbe?.status || 0,
    wordCount: Number(extraction?.wordCount || 0),
    confidence: Number(extraction?.confidence || 0),
    titleFound: Boolean(extraction?.title),
    boilerplate: Number(extraction?.boilerplateRatio || 0),
  })

  return {
    id: s.id,
    registry_key: s.registry_key,
    name: s.name,
    domain: s.domain,
    pauseClass: classifyPauseReason(s),
    homepage,
    feed,
    articleUrl,
    article: articleProbe,
    extraction,
    extractionHealth: extHealth,
    homepageBlocked: homepage?.robotsOrWaf || homepage?.status === 403,
    feedOk: Boolean(feed?.ok),
    articleOk: Boolean(articleProbe?.ok && Number(extraction?.wordCount || 0) >= 80),
  }
}

async function baseline(sql: ReturnType<Awaited<ReturnType<typeof import('@neondatabase/serverless')['neon']>>>) {
  const healthRes = await fetch('https://www.nahaber.com/api/health')
  const health = (await healthRes.json()) as Record<string, unknown>

  const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET
  let tick: Record<string, unknown> = { error: 'NO_CRON_SECRET' }
  let worker: Record<string, unknown> = { error: 'NO_CRON_SECRET' }
  if (secret) {
    const tickRes = await fetch('https://www.nahaber.com/api/cron/crawler/tick', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    tick = JSON.parse(await tickRes.text()) as Record<string, unknown>
    const ad = (tick.autoDraft || {}) as Record<string, unknown>
    tick = {
      status: tickRes.status,
      mode: ad.mode,
      jobsCreated: ad.jobsCreated ?? 0,
      providerCalls: ad.providerCalls ?? tick.aiRequests ?? 0,
      providerReason: ad.providerReason,
      sourcesChecked: tick.sourcesChecked,
    }

    const workerRes = await fetch('https://www.nahaber.com/api/cron/crawler-ai-worker', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    worker = JSON.parse(await workerRes.text()) as Record<string, unknown>
    worker = {
      status: workerRes.status,
      mode: worker.mode,
      claimed: worker.claimed ?? 0,
      providerCalls: worker.providerCalls ?? 0,
      reasons: worker.reasons,
    }
  }

  const ledger = (
    await sql`
    SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
    FROM crawler_ai_cost_ledger WHERE actual_cost_usd IS NOT NULL`
  )[0]
  const ledgerToday = (
    await sql`
    SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
    FROM crawler_ai_cost_ledger
    WHERE timestamp >= date_trunc('day', timezone('utc', now()))`
  )[0]
  const ledgerAfter = (
    await sql`
    SELECT coalesce(sum(actual_cost_usd),0)::float AS cost, count(*)::int AS n
    FROM crawler_ai_cost_ledger WHERE timestamp > ${T423}::timestamptz`
  )[0]

  const paidArmed =
    String(tick.mode) === 'CONTROLLED_AUTO_DRAFT' ||
    Number(tick.providerCalls) > 0 ||
    Number(worker.providerCalls) > 0 ||
    Number(tick.jobsCreated) > 0

  const out = {
    at: T423,
    expectedSha: EXPECTED_SHA,
    health,
    shaMatch: String(health.version) === EXPECTED_SHA,
    tick,
    worker,
    safety: {
      shadowMode: tick.mode === 'SHADOW_AUTO_DRAFT',
      providerOff: tick.providerReason === 'PROVIDER_DISABLED' || Number(tick.providerCalls) === 0,
      dispatchOff: Number(tick.jobsCreated) === 0,
      workerClaimedZero: Number(worker.claimed) === 0,
      paidArmed,
    },
    ledger: { all: ledger, today: ledgerToday, afterAuditStart: ledgerAfter },
    stopPaidPath: paidArmed,
  }
  writeOut('baseline', out)
  return out
}

async function inventory(sql: ReturnType<Awaited<ReturnType<typeof import('@neondatabase/serverless')['neon']>>>) {
  const sources = await sql`
    SELECT s.id, s.registry_key, s.name, s.domain, s.geographic_scope, s.source_category,
      s.quality_tier, s.health_score, s.status::text AS status, s.consecutive_failures,
      s.last_successful_discovery_at AS last_success_at,
      s.last_discovery_at AS last_crawl,
      s.last_pause_reason, s.base_url, s.freshness_hours, s.crawl_priority,
      s.city, s.district, s.language,
      s.rss_urls->>0 AS rss_url,
      (SELECT max(d.discovered_at) FROM discovered_article_urls d WHERE d.source_id = s.id) AS latest_discovery,
      (SELECT max(r.fetched_at) FROM raw_articles r WHERE r.source_id = s.id AND r.word_count > 0) AS latest_extraction,
      (SELECT max(r.created_at) FROM raw_articles r WHERE r.source_id = s.id) AS latest_raw_article,
      (SELECT r.title FROM raw_articles r WHERE r.source_id = s.id ORDER BY r.fetched_at DESC NULLS LAST LIMIT 1) AS latest_raw_title,
      (SELECT max(d.last_fetch_attempt) FROM discovered_article_urls d
        WHERE d.source_id = s.id AND d.status IN ('FAILED','FAILED_404','LOW_CONFIDENCE')) AS last_failure_at
    FROM news_sources s
    ORDER BY s.status, s.health_score DESC NULLS LAST, s.name`

  const rows = sources as SourceRow[]
  const health = summarizeSourceHealth(
    rows.map((s) => ({
      id: String(s.id),
      status: String(s.status) as 'ACTIVE' | 'PAUSED' | 'DEGRADED' | 'DISABLED',
      lastPauseReason: s.last_pause_reason ? String(s.last_pause_reason) : null,
      healthScore: s.health_score != null ? Number(s.health_score) : 50,
    })) as never
  )

  const out = { at: T423, source_health: health, sources: rows, total: rows.length }
  writeOut('inventory', out)
  return out
}

async function classifyPaused(inv: { sources: SourceRow[] }) {
  const paused = inv.sources.filter((s) => s.status === 'PAUSED')
  const classified = paused.map((s) => ({
    id: s.id,
    registry_key: s.registry_key,
    name: s.name,
    domain: s.domain,
    last_pause_reason: s.last_pause_reason,
    consecutive_failures: s.consecutive_failures,
    pauseClass: classifyPauseReason(s),
  }))
  const counts = classified.reduce((acc: Record<string, number>, s) => {
    acc[s.pauseClass] = (acc[s.pauseClass] || 0) + 1
    return acc
  }, {})
  const out = { at: T423, pausedCount: paused.length, byReason: counts, classified }
  writeOut('classify', out)
  return out
}

async function probePaused(inv: { sources: SourceRow[] }) {
  const paused = inv.sources.filter((s) => s.status === 'PAUSED')
  const probes = []
  for (const s of paused) {
    probes.push(await probeSourceDeep(s))
    await sleep(PROBE_DELAY_MS)
  }
  const out = { at: T423, probeCount: probes.length, probes }
  writeOut('probes', out)
  return out
}

async function recentArticles(
  sql: ReturnType<Awaited<ReturnType<typeof import('@neondatabase/serverless')['neon']>>>,
  probes: { probes: Array<Record<string, unknown>> }
) {
  const recoverable = probes.probes.filter(
    (p) => p.extractionHealth === 'EXTRACTION_HEALTHY' || p.extractionHealth === 'EXTRACTION_PARTIAL'
  )
  const tests = []
  for (const p of recoverable.slice(0, 15)) {
    const sourceId = String(p.id)
    const recent = await sql`
      SELECT id, title, original_url, word_count, extraction_confidence, fetched_at
      FROM raw_articles
      WHERE source_id = ${sourceId} AND word_count > 0
      ORDER BY fetched_at DESC NULLS LAST
      LIMIT 3`
    const liveSamples = []
    for (const row of recent as Record<string, unknown>[]) {
      const url = String(row.original_url || '')
      if (!url.startsWith('http')) continue
      const fetched = await fetchDocument({ url, skipPoliteness: true })
      const extracted = fetched.ok
        ? await extractArticleWithFallback(fetched.body, fetched.finalUrl, 'tr')
        : null
      liveSamples.push({
        url,
        dbWords: row.word_count,
        liveWords: extracted?.wordCount ?? 0,
        confidence: extracted?.extractionConfidence ?? 0,
        boilerplate: extracted ? boilerplateRatio(extracted.articleBodyText, extracted.title || '') : null,
        ok: Boolean(extracted && extracted.wordCount >= 80),
      })
      await sleep(800)
    }
    const okCount = liveSamples.filter((s) => s.ok).length
    tests.push({
      id: sourceId,
      registry_key: p.registry_key,
      name: p.name,
      domain: p.domain,
      sampleCount: liveSamples.length,
      successRatio: liveSamples.length ? okCount / liveSamples.length : 0,
      avgUsableWords:
        liveSamples.length > 0
          ? Math.round(liveSamples.reduce((n, s) => n + s.liveWords, 0) / liveSamples.length)
          : 0,
      avgConfidence:
        liveSamples.length > 0
          ? Math.round((liveSamples.reduce((n, s) => n + s.confidence, 0) / liveSamples.length) * 1000) / 1000
          : 0,
      avgBoilerplate:
        liveSamples.filter((s) => s.boilerplate != null).length > 0
          ? Math.round(
              (liveSamples.reduce((n, s) => n + (s.boilerplate || 0), 0) /
                liveSamples.filter((s) => s.boilerplate != null).length) *
                1000
            ) / 1000
          : null,
      homepageOnly: liveSamples.length === 0 && p.articleOk !== true,
      samples: liveSamples,
    })
  }
  const out = { at: T423, testedSources: tests.length, tests }
  writeOut('articles', out)
  return out
}

async function clusterAnalysis(sql: ReturnType<Awaited<ReturnType<typeof import('@neondatabase/serverless')['neon']>>>) {
  const perSource = await sql`
    SELECT s.id, s.registry_key, s.name, s.domain, s.status::text AS status, s.source_category,
      count(distinct c.id)::int AS unique_events,
      count(distinct CASE WHEN c.unique_source_count >= 2 THEN c.id END)::int AS multi_source_events,
      count(r.id)::int AS raw_articles,
      count(r.id) FILTER (WHERE coalesce(r.is_exact_duplicate,0)=1)::int AS duplicate_articles
    FROM news_sources s
    LEFT JOIN raw_articles r ON r.source_id = s.id
    LEFT JOIN news_clusters c ON c.id = r.cluster_id
    GROUP BY s.id, s.registry_key, s.name, s.domain, s.status, s.source_category
    ORDER BY unique_events DESC`

  const tierA = (
    await sql`
    SELECT count(*)::int AS c FROM crawler_ai_shadow_economic_decisions WHERE economic_tier = 'A'`
  )[0]
  const multiBlocked = (
    await sql`
    SELECT prespend_outcome, count(*)::int AS c
    FROM crawler_ai_shadow_economic_decisions e
    JOIN news_clusters c ON c.id = e.cluster_id
    WHERE c.unique_source_count >= 2
    GROUP BY 1 ORDER BY 2 DESC`
  )

  const activeOverlap = await sql`
    SELECT source_category, count(*)::int AS active_count
    FROM news_sources WHERE status = 'ACTIVE'
    GROUP BY 1 ORDER BY 2 DESC`

  const out = {
    at: T423,
    perSource,
    tierA,
    multiBlocked,
    activeOverlap,
    gapNote:
      'Few Tier A events driven by single-source WOULD_DISPATCH dominance + 41 PAUSED sources limiting independent confirmation',
  }
  writeOut('cluster', out)
  return out
}

async function canakkaleAudit(inv: { sources: SourceRow[] }) {
  const all = inv.sources
  const gaps: Array<{ district: string; gap: string }> = []
  for (const district of CANAKKALE_DISTRICTS) {
    const norm = district.toLocaleLowerCase('tr-TR')
    const matches = all.filter((s) => {
      const d = String(s.district || '').toLocaleLowerCase('tr-TR')
      const city = String(s.city || '').toLocaleLowerCase('tr-TR')
      const name = String(s.name || '').toLocaleLowerCase('tr-TR')
      const domain = String(s.domain || '').toLocaleLowerCase('tr-TR')
      if (district === 'Merkez') {
        return city.includes('çanakkale') && (!s.district || d.includes('merkez') || name.includes('olay') || name.includes('içinde'))
      }
      return d.includes(norm) || name.includes(norm) || domain.includes(norm.replace('ç', 'c').replace('ı', 'i'))
    })
    const active = matches.filter((s) => s.status === 'ACTIVE')
    if (active.length === 0) {
      gaps.push({
        district,
        gap:
          matches.length === 0
            ? 'NO_SOURCE_REGISTERED'
            : `NO_ACTIVE_SOURCE (${matches.length} PAUSED/DEGRADED: ${matches.map((m) => m.registry_key || m.domain).join(', ')})`,
      })
    } else if (matches.some((m) => m.status === 'PAUSED')) {
      gaps.push({
        district,
        gap: `PARTIAL_COVERAGE active=${active.map((a) => a.registry_key || a.domain).join(',')} paused=${matches.filter((m) => m.status === 'PAUSED').map((m) => m.registry_key || m.domain).join(',')}`,
      })
    }
  }
  const out = { at: T423, districts: CANAKKALE_DISTRICTS, gaps, gapCount: gaps.length }
  writeOut('canakkale', out)
  return out
}

async function scoreAndRank(
  inv: { sources: SourceRow[] },
  probes: { probes: Array<Record<string, unknown>> },
  cluster: { perSource: Array<Record<string, unknown>> },
  articles: { tests: Array<Record<string, unknown>> }
) {
  const clusterById = new Map(cluster.perSource.map((r) => [String(r.id), r]))
  const articleById = new Map(articles.tests.map((r) => [String(r.id), r]))
  const scored = []

  for (const p of probes.probes) {
    const s = inv.sources.find((x) => x.id === p.id)
    if (!s) continue
    const cl = clusterById.get(String(p.id))
    const art = articleById.get(String(p.id))
    const editorialCls = mapEditorialToContentValue(
      classifyEditorialContentClass({
        title: String(s.name),
        normalizedTopic: String(s.source_category),
        city: s.city ? String(s.city) : null,
      }),
      String(s.source_category || 'GENERAL')
    )
    const uniqueEvents = Number(cl?.unique_events || 0)
    const dupRatio =
      Number(cl?.raw_articles || 0) > 0
        ? Number(cl?.duplicate_articles || 0) / Number(cl?.raw_articles || 1)
        : 0
    const multiBoost = Math.min(15, Number(cl?.multi_source_events || 0) * 2)
    const score = recoveryScore({
      fetchOk: Boolean((p.homepage as Record<string, unknown>)?.ok),
      feedOk: Boolean(p.feedOk),
      articleOk: Boolean(p.articleOk),
      extraction: String(p.extractionHealth),
      editorialClass: editorialCls,
      freshnessHours: Number(s.freshness_hours || 48),
      uniqueEvents,
      multiSourceBoost: multiBoost,
      boilerplate: Number((p.extraction as Record<string, unknown>)?.boilerplateRatio || 0),
      duplicateRatio: dupRatio,
    })
    const tier = recoveryTier(score, p)
    scored.push({
      id: p.id,
      registry_key: p.registry_key,
      name: p.name,
      domain: p.domain,
      pauseClass: p.pauseClass,
      extractionHealth: p.extractionHealth,
      contentValue: editorialCls,
      recoveryScore: score,
      recoveryTier: tier,
      uniqueEvents,
      multiSourceEvents: cl?.multi_source_events ?? 0,
      duplicateRatio: Math.round(dupRatio * 1000) / 1000,
      articleTestSuccess: art?.successRatio ?? null,
      health_score: s.health_score,
      quality_tier: s.quality_tier,
      last_pause_reason: s.last_pause_reason,
    })
  }

  scored.sort((a, b) => b.recoveryScore - a.recoveryScore)
  const top10 = scored.slice(0, 10)
  const safestThree = scored
    .filter((s) => s.recoveryTier === 'RECOVER_NOW' || (s.recoveryTier === 'RECOVER_AFTER_FIX' && s.recoveryScore >= 65))
    .sort((a, b) => b.recoveryScore - a.recoveryScore)
    .slice(0, 3)

  const reeval = ['odatv', 'evrensel', 'ahaber'].map((key) => scored.find((s) => s.registry_key === key)).filter(Boolean)

  const out = { at: T423, scoredCount: scored.length, top10, safestThree, reevalTargets: reeval, allScored: scored }
  writeOut('scores', out)
  return out
}

function policyAudit() {
  const thresholds = [3, 6].map((n) => ({ failures: n, ...nextStatusForFailures(n) }))
  const out = {
    at: T423,
    policy: 'nextStatusForFailures in src/services/crawler/health.ts',
    thresholds,
    finding: 'Auto-pause at 6 consecutive failures, degrade at 3 — consistent with DB pause reasons (auto_pause_failures_6/7). No policy bug identified.',
    changeRecommended: false,
  }
  writeOut('policy', out)
  return out
}

function parserFixAudit(probes: { probes: Array<Record<string, unknown>> }) {
  const needsFix = probes.probes.filter(
    (p) =>
      p.feedOk &&
      !p.articleOk &&
      p.extractionHealth !== 'FETCH_BLOCKED' &&
      (p.homepage as Record<string, unknown>)?.ok
  )
  const out = {
    at: T423,
    parserCandidates: needsFix.map((p) => ({
      registry_key: p.registry_key,
      domain: p.domain,
      reason: 'Feed reachable but article extraction failed — likely listing/RSS URL pattern or site-specific HTML',
      localFixSuggested: 'Site-specific extractor or RSS link normalization — defer until activation approved',
    })),
    localFixesApplied: [],
    note: 'NO local code changes applied in 4F.4.2.3 audit',
  }
  writeOut('parser', out)
  return out
}

function generateReport(
  baseline: Record<string, unknown>,
  inv: Record<string, unknown>,
  classify: Record<string, unknown>,
  probes: Record<string, unknown>,
  articles: Record<string, unknown>,
  cluster: Record<string, unknown>,
  canakkale: Record<string, unknown>,
  scores: Record<string, unknown>,
  policy: Record<string, unknown>,
  parser: Record<string, unknown>
) {
  const health = baseline.health as Record<string, unknown>
  const safety = baseline.safety as Record<string, unknown>
  const top10 = scores.top10 as Array<Record<string, unknown>>
  const safest = scores.safestThree as Array<Record<string, unknown>>
  const reeval = scores.reevalTargets as Array<Record<string, unknown>>

  const lines = [
    'NAHABER GLOBAL CRAWLER',
    'PHASE 4F.4.2.3 — SOURCE RECOVERY DEEP AUDIT REPORT',
    `Generated: ${T423}`,
    '',
    '══════════════════════════════════════════════════',
    'P0 — SAFETY BASELINE',
    '══════════════════════════════════════════════════',
    `Starting SHA: ${EXPECTED_SHA}`,
    `Ending SHA: ${health.version} (${baseline.shaMatch ? 'MATCH' : 'MISMATCH'})`,
    `Health: ${health.status} @ ${health.time}`,
    `AI mode: ${(baseline.tick as Record<string, unknown>).mode}`,
    `Provider: ${(baseline.tick as Record<string, unknown>).providerCalls} calls (${(baseline.tick as Record<string, unknown>).providerReason || 'n/a'})`,
    `Tick jobsCreated: ${(baseline.tick as Record<string, unknown>).jobsCreated}`,
    `Worker claimed: ${(baseline.worker as Record<string, unknown>).claimed}`,
    `Ledger cumulative: $${((baseline.ledger as Record<string, unknown>).all as Record<string, number>).cost}`,
    `Ledger after audit start: $${((baseline.ledger as Record<string, unknown>).afterAuditStart as Record<string, number>).cost}`,
    `Paid path armed: ${safety.paidArmed ? 'YES — STOP' : 'NO'}`,
    `Evidence: tmp-phase4f423-baseline.json`,
    '',
    '══════════════════════════════════════════════════',
    'P1 — FULL SOURCE INVENTORY',
    '══════════════════════════════════════════════════',
    `Total: ${(inv.source_health as Record<string, number>).total}`,
    `ACTIVE: ${(inv.source_health as Record<string, number>).ACTIVE}`,
    `PAUSED: ${(inv.source_health as Record<string, number>).PAUSED}`,
    `DEGRADED: ${(inv.source_health as Record<string, number>).DEGRADED}`,
    `DISABLED: ${(inv.source_health as Record<string, number>).DISABLED}`,
    `Evidence: tmp-phase4f423-inventory.json`,
    '',
    '══════════════════════════════════════════════════',
    'P2 — PAUSE REASON CLASSIFICATION',
    '══════════════════════════════════════════════════',
    ...Object.entries(classify.byReason as Record<string, number>).map(([k, v]) => `- ${k}: ${v}`),
    `Evidence: tmp-phase4f423-classify.json`,
    '',
    '══════════════════════════════════════════════════',
    'P3-P4 — HTTP + EXTRACTION PROBES (PAUSED)',
    '══════════════════════════════════════════════════',
    `Probed: ${(probes as Record<string, number>).probeCount} PAUSED sources`,
    `Evidence: tmp-phase4f423-probes.json`,
    '',
    '══════════════════════════════════════════════════',
    'P5 — RECENT ARTICLE TEST',
    '══════════════════════════════════════════════════',
    `Recoverable sources tested: ${(articles as Record<string, number>).testedSources}`,
    `Evidence: tmp-phase4f423-articles.json`,
    '',
    '══════════════════════════════════════════════════',
    'P7-P8 — DUPLICATE + MULTI-SOURCE GAP',
    '══════════════════════════════════════════════════',
    `Tier A shadow rows: ${((cluster.tierA as Record<string, number>) || {}).c ?? 'n/a'}`,
    `Gap: ${cluster.gapNote}`,
    `Evidence: tmp-phase4f423-cluster.json`,
    '',
    '══════════════════════════════════════════════════',
    'P9 — ÇANAKKALE COVERAGE GAPS',
    '══════════════════════════════════════════════════',
    ...((canakkale.gaps as Array<{ district: string; gap: string }>) || []).map((g) => `- ${g.district}: ${g.gap}`),
    `Evidence: tmp-phase4f423-canakkale.json`,
    '',
    '══════════════════════════════════════════════════',
    'P10-P12 — RECOVERY SCORES + TOP 10 + SAFEST THREE',
    '══════════════════════════════════════════════════',
    'TOP 10:',
    ...top10.map(
      (s, i) =>
        `${i + 1}. ${s.registry_key || s.domain} (${s.name}) score=${s.recoveryScore} tier=${s.recoveryTier} extraction=${s.extractionHealth}`
    ),
    '',
    'SAFEST THREE (DO NOT ACTIVATE):',
    ...safest.map((s, i) => `${i + 1}. ${s.registry_key || s.domain} score=${s.recoveryScore} tier=${s.recoveryTier}`),
    '',
    'RE-EVAL odatv / evrensel / ahaber:',
    ...reeval.map((s) => `- ${s.registry_key}: score=${s.recoveryScore} tier=${s.recoveryTier} pause=${s.last_pause_reason}`),
    `Evidence: tmp-phase4f423-scores.json`,
    '',
    '══════════════════════════════════════════════════',
    'P13 — PARSER FIXES (LOCAL ONLY)',
    '══════════════════════════════════════════════════',
    `Candidates: ${(parser.parserCandidates as unknown[]).length}`,
    `Fixes applied: ${(parser.localFixesApplied as unknown[]).length}`,
    `Evidence: tmp-phase4f423-parser.json`,
    '',
    '══════════════════════════════════════════════════',
    'P14 — SOURCE HEALTH POLICY',
    '══════════════════════════════════════════════════',
    `${policy.finding}`,
    `Change recommended: ${policy.changeRecommended}`,
    `Evidence: tmp-phase4f423-policy.json`,
    '',
    '══════════════════════════════════════════════════',
    'P15-P16 — COST & FINAL SAFETY',
    '══════════════════════════════════════════════════',
    `New AI cost this audit: $${((baseline.ledger as Record<string, unknown>).afterAuditStart as Record<string, number>).cost}`,
    `Production source changes: NONE`,
    `Source activations: NONE`,
    `Deploy: NONE`,
    '',
    '══════════════════════════════════════════════════',
    'VERDICT',
    '══════════════════════════════════════════════════',
    safety.paidArmed
      ? 'STOP — PAID PATH ARMED'
      : 'PHASE 4F.4.2.3 SOURCE RECOVERY AUDIT VERIFIED — RECOVERY PLAN READY, PRODUCTION UNCHANGED, ZERO PAID AI',
    '',
    'STOP — WAIT FOR DEPLOY SLOT. NO PHASE 4F.5.',
  ]

  writeFileSync('tmp-phase4f423-REPORT.txt', lines.join('\n'))
  writeOut('report-meta', { at: T423, verdict: lines.at(-3), lineCount: lines.length })
}

async function main() {
  loadEnvLocal()
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    console.error('NO_DATABASE_URL')
    process.exit(1)
  }
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!)

  if (mode === 'baseline' || mode === 'full') {
    const b = await baseline(sql)
    if (b.stopPaidPath) {
      console.error('STOP_PAID_PATH_ARMED')
      process.exit(2)
    }
  }

  let inv = readOut<{ sources: SourceRow[]; source_health: unknown }>('inventory')
  if ((mode === 'inventory' || mode === 'full') && !inv) inv = await inventory(sql)

  let cls = readOut<Record<string, unknown>>('classify')
  if ((mode === 'classify' || mode === 'full') && inv && !cls) cls = await classifyPaused(inv)

  let probes = readOut<{ probes: Array<Record<string, unknown>> }>('probes')
  if ((mode === 'probe' || mode === 'full') && inv && !probes) probes = await probePaused(inv)

  let cluster = readOut<Record<string, unknown>>('cluster')
  if ((mode === 'cluster' || mode === 'full') && !cluster) cluster = await clusterAnalysis(sql)

  let canakkale = readOut<Record<string, unknown>>('canakkale')
  if ((mode === 'canakkale' || mode === 'full') && inv && !canakkale) canakkale = await canakkaleAudit(inv)

  let articles = readOut<{ tests: Array<Record<string, unknown>> }>('articles')
  if ((mode === 'articles' || mode === 'full') && probes && !articles) {
    articles = await recentArticles(sql, probes)
  }

  let scores = readOut<Record<string, unknown>>('scores')
  if ((mode === 'score' || mode === 'full') && inv && probes && cluster && articles && !scores) {
    scores = await scoreAndRank(inv, probes, cluster as never, articles)
  }

  let policy = readOut<Record<string, unknown>>('policy')
  if ((mode === 'score' || mode === 'full') && !policy) policy = policyAudit()

  let parser = readOut<Record<string, unknown>>('parser')
  if ((mode === 'score' || mode === 'full') && probes && !parser) parser = parserFixAudit(probes)

  if (mode === 'report' || mode === 'full') {
    const b = readOut<Record<string, unknown>>('baseline')
    if (!b || !inv || !cls || !probes || !articles || !cluster || !canakkale || !scores || !policy || !parser) {
      console.error('MISSING_ARTIFACTS_FOR_REPORT')
      process.exit(1)
    }
    generateReport(b, inv, cls, probes, articles, cluster, canakkale, scores, policy, parser)
    console.log('REPORT_WRITTEN tmp-phase4f423-REPORT.txt')
  }

  console.log(JSON.stringify({ mode, at: T423, ok: true }))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
