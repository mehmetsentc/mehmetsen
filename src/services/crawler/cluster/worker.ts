import { crawlerTickLimits } from '../enabled'
import { categoryHintForEvent, isDominantAgenda } from './agenda'
import { clusterTopicFromTitle } from './cheap'
import { buildEventFingerprint } from './fingerprint'
import { namedTokensMatch } from './normalize'
import { promotePublishedNewsToFeatured } from './promoteFeatured'
import { MATCH_HORIZON_MS, scoreClusterMatch } from './score'
import { detectMaterialUpdate, selectPrimaryArticle } from './canonical'
import { evaluateClusterEligibility, looksLikeNewsText } from './eligibility'
import { isHighQualityTier, scoreEventImportance } from './importance'
import { assignMembershipRole, futureAiUnitsForEvent, independentSourceCount } from './roles'
import { clusterHasPublishedOutput } from '../gate/quality'
import { dispatchCrawlerArticleToNewsroom } from '../dispatch'
import type { CrawlerStore } from '../store/types'
import { loadArticlesTextByIds, loadSourcesByIds } from '../store/batchLoad'
import type { NewsClusterRecord, NewsSourceRecord, RawArticleRecord } from '../types'

export interface ClusterTickResult {
  articlesProcessed: number
  clustersCreated: number
  articlesClustered: number
  merges: number
  clusterMerges: number
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
    clusterMerges: 0,
    borderline: 0,
    aiCalls: 0,
  }
  void dispatchCrawlerArticleToNewsroom()

  const pending = await opts.store.listPendingClusterArticles(limits.maxClusterArticlesPerTick)
  // FinOps 3 Oct: representative articles were read one row per candidate cluster per
  // article (~210k single-row PG reads/day). Batch per article and reuse within the tick.
  const repMemo = new Map<string, RawArticleRecord | null>()
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
    const missingRepIds = candidates
      .map((c) => c.representativeArticleId)
      .filter((id): id is string => Boolean(id) && !repMemo.has(id as string))
    if (missingRepIds.length) {
      const loaded = await loadArticlesTextByIds(opts.store, missingRepIds)
      for (const id of missingRepIds) repMemo.set(id, loaded.get(id) ?? null)
    }
    for (const cluster of candidates) {
      const rep = cluster.representativeArticleId
        ? repMemo.get(cluster.representativeArticleId) ?? null
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
        incomingLead: `${article.description || ''} ${article.articleBodyText || ''}`.slice(0, 600),
      })
      if (material.hasMaterialUpdate) {
        await opts.store.updateCluster(cluster.id, {
          hasMaterialUpdate: true,
          materialUpdateReason: material.materialUpdateReason,
        })
      }
    }

    await recomputeCluster(opts.store, cluster.id, now, {
      incomingArticleId: article.id,
      incomingIsMaterialUpdate: highMatch
        ? detectMaterialUpdate({
            existingTitle: cluster.canonicalTitle,
            existingLead: cluster.normalizedTopic,
            incomingTitle: article.title,
            incomingLead: `${article.description || ''} ${article.articleBodyText || ''}`.slice(0, 600),
          }).hasMaterialUpdate
        : false,
    })
  }

  result.clusterMerges = await mergeSameStoryClusters(opts.store, now, tickStarted, limits.maxTickRuntimeMs)
  await promoteOpenAgenda(opts.store, now)

  return result
}

/** Feature the published copy of a real-agenda cluster once it goes live. */
async function promoteOpenAgenda(store: CrawlerStore, now: Date): Promise<void> {
  const since = new Date(now.getTime() - MATCH_HORIZON_MS)
  const recent = await store.recentClusters(null, since)
  for (const cluster of recent) {
    if (cluster.importanceBreakdown?.realAgenda !== 1) continue
    if (cluster.importanceBreakdown?.agendaFeatured === 1) continue
    if (!cluster.publishedNewsId) continue
    const promoted = await promotePublishedNewsToFeatured(cluster.publishedNewsId)
    if (promoted !== 'featured' && promoted !== 'ineligible') continue
    await store.updateCluster(cluster.id, {
      importanceBreakdown: { ...cluster.importanceBreakdown, agendaFeatured: 1 },
    })
  }
}

async function recomputeCluster(
  store: CrawlerStore,
  clusterId: string,
  now: Date,
  extra?: { incomingArticleId?: string; incomingIsMaterialUpdate?: boolean }
): Promise<void> {
  const cluster = await store.getCluster(clusterId)
  if (!cluster) return
  const memberships = await store.listMemberships(clusterId)
  const members: Array<{ article: RawArticleRecord; source: NewsSourceRecord | null; membershipId: string }> = []
  const articles = await loadArticlesTextByIds(store, memberships.map((m) => m.articleId))
  const sources = await loadSourcesByIds(
    store,
    [...articles.values()].map((a) => a.sourceId)
  )
  for (const m of memberships) {
    const article = articles.get(m.articleId)
    if (!article) continue
    members.push({ article, source: sources.get(article.sourceId) ?? null, membershipId: m.id })
  }
  if (!members.length) return
  const primary = selectPrimaryArticle(members)
  const canonical = primary?.article || members[0].article
  const uniqueSources = new Set(members.map((m) => m.article.sourceId))
  const independent = independentSourceCount(members)
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
    independentSourceCount: independent,
    exactDuplicateOnly: members.length > 0 && members.every((m) => m.article.isExactDuplicate),
    staleHours: (now.getTime() - last) / 3600000,
    namedTokenCount: named.size,
    looksLikeNews: looksLikeNewsText(canonical.title || cluster.canonicalTitle, canonical.articleBodyText || null),
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

  const published = clusterHasPublishedOutput(members.map((m) => m.article))
  const material = cluster.hasMaterialUpdate || Boolean(extra?.incomingIsMaterialUpdate)
  let futureAiUnit = cluster.futureAiUnit
  let updateReviewStatus = cluster.updateReviewStatus
  let editorialDecision = cluster.editorialDecision
  if (published.published) {
    futureAiUnit = 'PUBLISHED_LOCKED'
    if (material) updateReviewStatus = 'PENDING_UPDATE_REVIEW'
    else updateReviewStatus = cluster.updateReviewStatus || 'NONE'
    void futureAiUnitsForEvent(members.length)
  }

  for (const row of members) {
    const role = assignMembershipRole({
      isPrimary: row.article.id === canonical.id,
      isExactDuplicate: row.article.isExactDuplicate,
      qualityStatus: row.article.qualityStatus,
      isMaterialUpdate: Boolean(extra?.incomingIsMaterialUpdate && extra.incomingArticleId === row.article.id),
    })
    await store.updateMembership(row.membershipId, {
      isCanonical: row.article.id === canonical.id,
      membershipRole: role,
      isIndependentSource: !row.article.isExactDuplicate,
    })
    await store.updateRawArticle(row.article.id, { clusterRole: role })
  }

  const primarySource = members.find((m) => m.article.id === canonical.id)?.source || null
  const editorClosed = cluster.editorialDecision === 'REJECTED' || cluster.editorialDecision === 'ARCHIVED'
  const peers = await store.recentClusters(cluster.countryCode, new Date(now.getTime() - MATCH_HORIZON_MS))
  const otherCounts = peers
    .filter((p) => p.id !== clusterId && p.eventStatus !== 'CLOSED')
    .map((p) => p.uniqueSourceCount || 0)
  const dominant = !editorClosed && isDominantAgenda(uniqueSources.size, otherCounts)
  const breakdown: Record<string, number> = {
    ...importance.breakdown,
    confirmedSources: uniqueSources.size,
    realAgenda: dominant ? 1 : 0,
  }
  if (cluster.importanceBreakdown?.agendaFeatured === 1) breakdown.agendaFeatured = 1
  let editorialPriority = cluster.editorialPriority
  if (dominant && editorialPriority === 'NORMAL') editorialPriority = 'HIGH'
  const newsId = published.newsId || cluster.publishedNewsId
  if (dominant && newsId && breakdown.agendaFeatured !== 1) {
    const promoted = await promotePublishedNewsToFeatured(newsId)
    if (promoted === 'featured' || promoted === 'ineligible') breakdown.agendaFeatured = 1
  }
  const categoryHint =
    categoryHintForEvent(canonical.title || cluster.canonicalTitle, uniqueSources.size) || cluster.categoryHint

  await store.updateCluster(clusterId, {
    representativeArticleId: canonical.id,
    canonicalTitle: canonical.title || cluster.canonicalTitle,
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
    importanceBreakdown: breakdown,
    categoryHint,
    editorialPriority,
    signatureTokens: [...named].slice(0, 16),
    language: canonical.language || cluster.language,
    city: cluster.city || canonical.city || members[0]?.source?.city || null,
    district: cluster.district || canonical.district || members[0]?.source?.district || null,
    primarySelectionScore: primary?.score ?? null,
    primarySelectionReasons: primary?.reasons ?? null,
    publishedNewsId: published.newsId || cluster.publishedNewsId,
    futureAiUnit,
    updateReviewStatus,
    editorialDecision,
    primaryImageUrl: canonical.mainImageUrl,
    primarySourceId: canonical.sourceId,
    primarySourceName: primarySource?.name || null,
  })
}

/** Fold already-split copies of one story (different publisher cities) into one event. */
async function mergeSameStoryClusters(
  store: CrawlerStore,
  now: Date,
  tickStarted: number,
  maxTickRuntimeMs: number
): Promise<number> {
  if (Date.now() - tickStarted > maxTickRuntimeMs) return 0
  const since = new Date(now.getTime() - MATCH_HORIZON_MS)
  const recent = (await store.recentClusters(null, since)).filter(
    (cluster) => cluster.eventStatus !== 'CLOSED' && (cluster.articleCount || 0) > 0 && cluster.canonicalTitle
  )
  const window = recent.slice(0, 40)
  if (window.length < 2) return 0

  const packed = window.map((cluster) => ({
    cluster,
    fp: buildEventFingerprint({
      title: cluster.canonicalTitle,
      language: cluster.language,
      countryCode: cluster.countryCode,
      region: cluster.region,
      city: cluster.city,
      district: cluster.district,
      publishedAt: cluster.lastSeenAt,
    }),
  }))
  const parent = new Map(packed.map((row) => [row.cluster.id, row.cluster.id]))
  const find = (id: string): string => {
    const next = parent.get(id) || id
    if (next === id) return id
    const root = find(next)
    parent.set(id, root)
    return root
  }
  const unite = (a: string, b: string) => {
    const left = find(a)
    const right = find(b)
    if (left !== right) parent.set(right, left)
  }

  for (let i = 0; i < packed.length; i++) {
    if (Date.now() - tickStarted > maxTickRuntimeMs) break
    for (let j = i + 1; j < packed.length; j++) {
      const shared = packed[i].fp.properNameTokens.filter((token) =>
        packed[j].fp.properNameTokens.some((other) => namedTokensMatch(token, other))
      )
      if (shared.length < 2) continue
      const scored = scoreClusterMatch(
        packed[i].fp,
        {
          fingerprint: packed[j].fp,
          lastSeenAt: packed[j].cluster.lastSeenAt,
          firstSeenAt: packed[j].cluster.firstSeenAt,
        },
        now
      )
      if (scored.band === 'HIGH') unite(packed[i].cluster.id, packed[j].cluster.id)
    }
  }

  const groups = new Map<string, string[]>()
  for (const row of packed) {
    const root = find(row.cluster.id)
    const list = groups.get(root) || []
    list.push(row.cluster.id)
    groups.set(root, list)
  }

  let merges = 0
  for (const ids of groups.values()) {
    if (ids.length < 2) continue
    if (Date.now() - tickStarted > maxTickRuntimeMs) break
    const ranked = ids
      .map((id) => packed.find((row) => row.cluster.id === id)!.cluster)
      .sort(
        (a, b) =>
          (b.articleCount || 0) - (a.articleCount || 0) || (b.uniqueSourceCount || 0) - (a.uniqueSourceCount || 0)
      )
    const keep = ranked[0]
    if (!keep) continue
    for (const drop of ranked.slice(1)) {
      const memberships = await store.listMemberships(drop.id)
      for (const membership of memberships) {
        await store.updateMembership(membership.id, { clusterId: keep.id })
        await store.updateRawArticle(membership.articleId, { clusterId: keep.id, clusterStatus: 'CLUSTERED' })
      }
      await store.updateCluster(drop.id, {
        eventStatus: 'CLOSED',
        articleCount: 0,
        sourceCount: 0,
        uniqueSourceCount: 0,
        representativeArticleId: null,
      })
      merges += 1
    }
    await recomputeCluster(store, keep.id, now)
  }
  return merges
}
