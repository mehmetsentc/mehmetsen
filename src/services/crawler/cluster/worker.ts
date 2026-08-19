import { crawlerTickLimits } from '../enabled'
import { clusterTopicFromTitle } from './cheap'
import { buildEventFingerprint } from './fingerprint'
import { namedTokensMatch } from './normalize'
import { MATCH_HORIZON_MS, scoreClusterMatch } from './score'
import { detectMaterialUpdate, selectCanonicalArticle } from './canonical'
import { evaluateClusterEligibility, looksLikeNewsText } from './eligibility'
import { isHighQualityTier, scoreEventImportance } from './importance'
import { dispatchCrawlerArticleToNewsroom } from '../dispatch'
import type { CrawlerStore } from '../store/types'
import type { NewsClusterRecord, NewsSourceRecord, RawArticleRecord } from '../types'

export interface ClusterTickResult {
  articlesProcessed: number
  clustersCreated: number
  articlesClustered: number
  merges: number
  borderline: number
  aiCalls: number
}

function fingerprintFromArticle(article: RawArticleRecord, source: NewsSourceRecord | null) {
  return buildEventFingerprint({
    title: article.title,
    description: article.description,
    body: article.articleBodyText,
    language: article.language || source?.language,
    countryCode: article.countryCode || source?.countryCode,
    region: article.region || source?.region,
    city: article.city || source?.city,
    district: article.district || source?.district,
    simhash: article.simhash,
    publishedAt: article.publishedAt || article.fetchedAt,
  })
}

function fingerprintFromCluster(cluster: NewsClusterRecord, canonical: RawArticleRecord | null) {
  return buildEventFingerprint({
    title: cluster.canonicalTitle || canonical?.title || cluster.normalizedTopic,
    description: canonical?.description,
    body: canonical?.articleBodyText,
    language: cluster.language || canonical?.language,
    countryCode: cluster.countryCode || canonical?.countryCode,
    region: cluster.region || canonical?.region,
    city: cluster.city || canonical?.city,
    district: cluster.district || canonical?.district,
    simhash: canonical?.simhash,
    publishedAt: cluster.latestArticleAt || cluster.lastSeenAt,
  })
}

export async function runClusterTick(opts: {
  store: CrawlerStore
  now?: Date
  startedAt?: number
}): Promise<ClusterTickResult> {
  const now = opts.now ?? new Date()
  const tickStarted = opts.startedAt ?? Date.now()
  const clusterStarted = Date.now()
  const limits = crawlerTickLimits()
  const result: ClusterTickResult = {
    articlesProcessed: 0,
    clustersCreated: 0,
    articlesClustered: 0,
    merges: 0,
    borderline: 0,
    aiCalls: 0,
  }
  void dispatchCrawlerArticleToNewsroom()

  const pending = await opts.store.listPendingClusterArticles(limits.maxClusterArticlesPerTick)
  for (const article of pending) {
    if (Date.now() - tickStarted > limits.maxTickRuntimeMs) break
    if (Date.now() - clusterStarted > limits.maxClusterRuntimeMs) break
    result.articlesProcessed += 1
    const existing = await opts.store.getMembershipByArticle(article.id)
    if (existing) {
      await opts.store.updateRawArticle(article.id, { clusterId: existing.clusterId, clusterStatus: 'CLUSTERED' })
      continue
    }
    const source = await opts.store.getSource(article.sourceId)
    const fp = fingerprintFromArticle(article, source)
    const since = new Date(now.getTime() - MATCH_HORIZON_MS)
    const recent = await opts.store.recentClusters(article.countryCode || source?.countryCode || null, since)
    const candidates = recent
      .filter((cluster) => {
        if (cluster.language && fp.language && cluster.language !== fp.language) return false
        const tokens = cluster.signatureTokens || []
        if (tokens.length && fp.namedTokens.length) {
          return (
            tokens.some((t) => fp.namedTokens.some((n) => namedTokensMatch(t, n))) ||
            cluster.eventKey === fp.eventKey
          )
        }
        return true
      })
      .slice(0, limits.maxClusterCandidatesPerArticle)

    let best: { cluster: NewsClusterRecord; score: ReturnType<typeof scoreClusterMatch> } | null = null
    for (const cluster of candidates) {
      const rep = cluster.representativeArticleId
        ? await opts.store.getRawArticle(cluster.representativeArticleId)
        : null
      const scored = scoreClusterMatch(
        fp,
        {
          fingerprint: fingerprintFromCluster(cluster, rep),
          lastSeenAt: cluster.lastSeenAt,
          firstSeenAt: cluster.firstSeenAt,
        },
        now
      )
      if (!best || scored.final > best.score.final) best = { cluster, score: scored }
    }

    const highMatch = best && best.score.band === 'HIGH'
    if (best?.score.band === 'BORDERLINE') {
      result.borderline += 1
      await opts.store.incrementMetric('borderline_matches', 1, now)
    }

    let cluster: NewsClusterRecord
    let created = false
    if (highMatch && best) {
      cluster = best.cluster
      result.merges += 1
    } else {
      cluster = await opts.store.insertCluster({
        representativeArticleId: article.id,
        normalizedTopic: clusterTopicFromTitle(article.title),
        countryCode: fp.countryCode,
        city: source?.city || article.city,
        eventKey: fp.eventKey,
        canonicalTitle: article.title,
        language: fp.language,
        region: fp.region,
        district: fp.district,
        signatureTokens: fp.namedTokens.slice(0, 12),
      })
      created = true
      result.clustersCreated += 1
      await opts.store.incrementMetric('clusters_created', 1, now)
    }

    const inserted = await opts.store.insertMembership({
      clusterId: cluster.id,
      articleId: article.id,
      sourceId: article.sourceId,
      similarityScore: highMatch && best ? best.score.final : 1,
      matchBand: highMatch && best ? best.score.band : 'LOW',
      matchExplanation: highMatch && best ? best.score : { titleSimilarity: 1, tokenOverlap: 1, entityOverlap: 1, timeScore: 1, geoScore: 1, numericOverlap: 1, final: 1 },
      isCanonical: created,
    })
    if (inserted === 'duplicate') {
      await opts.store.updateRawArticle(article.id, { clusterId: cluster.id, clusterStatus: 'CLUSTERED' })
      continue
    }
    result.articlesClustered += 1
    await opts.store.incrementMetric('articles_clustered', 1, now)
    await opts.store.updateRawArticle(article.id, { clusterId: cluster.id, clusterStatus: 'CLUSTERED' })

    if (highMatch) {
      const material = detectMaterialUpdate({
        existingTitle: cluster.canonicalTitle,
        existingLead: cluster.normalizedTopic,
        incomingTitle: article.title,
        incomingLead: article.description,
      })
      if (material.hasMaterialUpdate) {
        await opts.store.updateCluster(cluster.id, {
          hasMaterialUpdate: true,
          materialUpdateReason: material.materialUpdateReason,
        })
      }
    }

    await recomputeCluster(opts.store, cluster.id, now)
  }

  return result
}

async function recomputeCluster(store: CrawlerStore, clusterId: string, now: Date): Promise<void> {
  const cluster = await store.getCluster(clusterId)
  if (!cluster) return
  const memberships = await store.listMemberships(clusterId)
  const members: Array<{ article: RawArticleRecord; source: NewsSourceRecord | null }> = []
  for (const m of memberships) {
    const article = await store.getRawArticle(m.articleId)
    if (!article) continue
    members.push({ article, source: await store.getSource(article.sourceId) })
  }
  if (!members.length) return
  const canonical = selectCanonicalArticle(members)
  const uniqueSources = new Set(members.map((m) => m.article.sourceId))
  const highQuality = members.filter((m) => m.source && isHighQualityTier(m.source.qualityTier)).length
  const exactDupes = members.filter((m) => m.article.isExactDuplicate).length
  const localCount = members.filter(
    (m) =>
      m.source?.geographicScope === 'CITY' ||
      m.source?.geographicScope === 'DISTRICT' ||
      m.source?.sourceType === 'LOCAL' ||
      Boolean(m.source?.city || m.article.city)
  ).length
  const nationalCount = members.filter(
    (m) => m.source?.geographicScope === 'NATIONAL' || m.source?.sourceType === 'NATIONAL'
  ).length
  const countries = new Set(members.map((m) => m.article.countryCode || m.source?.countryCode).filter(Boolean))
  const times = members
    .map((m) => m.article.publishedAt || m.article.fetchedAt)
    .filter((d): d is Date => Boolean(d))
    .map((d) => d.getTime())
  const first = Math.min(...times, cluster.firstSeenAt.getTime())
  const last = Math.max(...times, now.getTime())
  const hours = Math.max(0.25, (last - first) / 3600000)
  const avgHealth = members.reduce((n, m) => n + (m.source?.healthScore ?? 50), 0) / members.length
  const avgConf = members.reduce((n, m) => n + (m.article.extractionConfidence ?? 0), 0) / members.length
  const bestWords = Math.max(...members.map((m) => m.article.wordCount ?? 0), 0)
  const bestConf = Math.max(...members.map((m) => m.article.extractionConfidence ?? 0), 0)
  const scope = members[0]?.source?.geographicScope || 'NATIONAL'
  const priority = members.reduce((best, m) => {
    const band = m.source?.crawlPriority || 'NORMAL'
    if (band === 'BREAKING') return 'BREAKING'
    if (band === 'HIGH' && best !== 'BREAKING') return 'HIGH'
    return best
  }, 'NORMAL' as 'BREAKING' | 'HIGH' | 'NORMAL' | 'LOW')
  const importance = scoreEventImportance({
    uniqueSourceCount: uniqueSources.size,
    highQualitySourceCount: highQuality,
    articleCount: members.length,
    exactDuplicateCount: exactDupes,
    avgHealth,
    avgConfidence: avgConf,
    crawlPriority: priority,
    freshnessHours: (now.getTime() - last) / 3600000,
    geographicScope: scope,
    hasCity: Boolean(cluster.city || members.some((m) => m.article.city || m.source?.city)),
    hasDistrict: Boolean(cluster.district || members.some((m) => m.article.district || m.source?.district)),
    localSourceCount: localCount,
    nationalSourceCount: nationalCount,
    countryCount: countries.size || 1,
    publicationVelocityPerHour: members.length / hours,
  })
  const named = new Set(members.flatMap((m) => fingerprintFromArticle(m.article, m.source).namedTokens))
  const eligibility = evaluateClusterEligibility({
    bestWordCount: bestWords,
    bestConfidence: bestConf,
    avgHealth,
    uniqueSourceCount: members.length,
    independentSourceCount: uniqueSources.size,
    exactDuplicateOnly: members.length > 0 && members.every((m) => m.article.isExactDuplicate),
    staleHours: (now.getTime() - last) / 3600000,
    namedTokenCount: named.size,
    looksLikeNews: looksLikeNewsText(canonical?.title || cluster.canonicalTitle, canonical?.articleBodyText || null),
    geographicScope: scope,
    hasLocalGeography: Boolean(
      cluster.city ||
        cluster.district ||
        members.some((m) => m.source?.geographicScope === 'CITY' || m.source?.geographicScope === 'DISTRICT')
    ),
    importanceScore: importance.importanceScore,
    crawlPriority: priority,
    watchingAgeMinutes: (now.getTime() - first) / 60000,
  })

  await store.updateCluster(clusterId, {
    representativeArticleId: canonical?.id || cluster.representativeArticleId,
    canonicalTitle: canonical?.title || cluster.canonicalTitle,
    articleCount: members.length,
    sourceCount: uniqueSources.size,
    uniqueSourceCount: uniqueSources.size,
    highQualitySourceCount: highQuality,
    lastSeenAt: new Date(last),
    latestArticleAt: new Date(last),
    sourceDiversityScore: importance.sourceDiversityScore,
    importanceScore: importance.importanceScore,
    globalImportance: importance.globalImportance,
    nationalImportance: importance.nationalImportance,
    localImportance: importance.localImportance,
    freshnessScore: importance.freshnessScore,
    clusterConfidence: Number((avgConf || 0).toFixed(4)),
    aiEligibility: eligibility.eligibility,
    aiEligibilityReason: eligibility.reason,
    importanceBreakdown: importance.breakdown,
    signatureTokens: [...named].slice(0, 16),
    language: canonical?.language || cluster.language,
    city: cluster.city || canonical?.city || members[0]?.source?.city || null,
    district: cluster.district || canonical?.district || members[0]?.source?.district || null,
  })
}
