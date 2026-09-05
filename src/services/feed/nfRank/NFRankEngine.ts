/**
 * NFRank V1 — multi-stage ranking over existing Feed candidates.
 * Deterministic, inspectable, Feed V2–scoped. No AI.
 */
import type {
  FeedCandidateRow,
  FeedCandidateSource,
  FeedMode,
  FeedRankReason,
  FeedScoreBreakdown,
  FeedUserContext,
  ScoredFeedCandidate,
} from '@/types/smartFeed'
import {
  NFRANK_CONFIG_V1,
  NFRANK_VERSION,
  nfRankArchiveRediscoveryScore,
  nfRankFreshnessScore,
} from '@/lib/feed/nfRankConfig'
import { normalizeTag } from '@/lib/tags'
import { feedUserContextService } from '../FeedUserContextService'

/** Bounded session intent — does NOT permanently mutate long-term profile. */
export interface NfSessionIntent {
  categoryBoosts: Map<string, number>
  publisherBoosts: Map<string, number>
  /** Decayed session tag boosts (normalized tag keys). */
  tagBoosts: Map<string, number>
  /** Count of quick skips per category in recent session window. */
  categoryQuickSkips: Map<string, number>
  /** Bounded quick-skip counts per tag (not permanent). */
  tagQuickSkips: Map<string, number>
  /** Explicit negative targets (article/publisher/category) from session. */
  explicitNegatives: Array<{ targetType: string; targetId: string }>
}

export interface NfRankComponents {
  dwellIntent: number
  readIntent: number
  saveIntent: number
  shareIntent: number
  followIntent: number
  topicAffinity: number
  categoryAffinity: number
  publisherAffinity: number
  freshness: number
  localRelevance: number
  editorialImportance: number
  quality: number
  engagement: number
  discovery: number
  sessionIntent: number
  archiveRediscovery: number
  explorationBonus: number
  quickSkipPenalty: number
  explicitNegativePenalty: number
  clusterRepeatPenalty: number
  publisherSaturationPenalty: number
  categorySaturationPenalty: number
  /** Tag affinity contribution used in topicAffinity (0..1). */
  tagAffinityContribution: number
  matchedTagCount: number
  sessionTagContribution: number
  longTermTagContribution: number
  baseScore: number
  finalScore: number
}

export interface NfRankExplain {
  rankingVersion: typeof NFRANK_VERSION
  candidateSources: FeedCandidateSource[]
  components: NfRankComponents
  finalScore: number
  position: number
}

export interface NfRankedCandidate extends ScoredFeedCandidate {
  nfExplain?: NfRankExplain
  candidateSources?: FeedCandidateSource[]
}

export function emptySessionIntent(): NfSessionIntent {
  return {
    categoryBoosts: new Map(),
    publisherBoosts: new Map(),
    tagBoosts: new Map(),
    categoryQuickSkips: new Map(),
    tagQuickSkips: new Map(),
    explicitNegatives: [],
  }
}

/** Normalize existing article tags — never invent. Multi-tag credit is bounded later. */
export function normalizeCandidateTags(raw: string[] | null | undefined): string[] {
  if (!raw?.length) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of raw) {
    const stripped = typeof t === 'string' ? t.trim().replace(/^#+\s*/, '') : ''
    if (!stripped) continue
    // ASCII acronyms (AI, iPhone) must not fragment via tr-TR İ/I folding.
    const n =
      /^[A-Za-z0-9 _-]+$/.test(stripped)
        ? stripped.toLowerCase().replace(/\s+/g, '-')
        : normalizeTag(stripped)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= 8) break
  }
  return out
}

/**
 * Tag affinity from long-term interests + faster-decaying session tag intent.
 * Multi-tag articles: mean of matched scores (bounded) — cannot multiply without bounds.
 */
export function computeTagAffinityFeatures(
  tags: string[],
  ctx: FeedUserContext,
  session: NfSessionIntent
): {
  tagAffinityContribution: number
  matchedTagCount: number
  sessionTagContribution: number
  longTermTagContribution: number
} {
  if (!tags.length) {
    return {
      tagAffinityContribution: 0,
      matchedTagCount: 0,
      sessionTagContribution: 0,
      longTermTagContribution: 0,
    }
  }
  let longSum = 0
  let sessionSum = 0
  let matched = 0
  for (const tag of tags) {
    const long = feedUserContextService.interestScore(ctx, tag)
    const sess = session.tagBoosts.get(tag) ?? 0
    const skip = session.tagQuickSkips.get(tag) ?? 0
    // One skip must not permanently destroy — tiny temporary dampen only.
    const skipDamp = skip <= 0 ? 1 : skip === 1 ? 0.92 : Math.max(0.55, 1 - skip * 0.12)
    if (long > 0 || sess > 0) matched += 1
    longSum += long
    sessionSum += sess * skipDamp
  }
  // Bound multi-tag inflation: average, not sum.
  const longTermTagContribution = clamp01(longSum / tags.length)
  const sessionTagContribution = clamp01(sessionSum / tags.length)
  const tagAffinityContribution = clamp01(longTermTagContribution * 0.65 + sessionTagContribution * 0.35)
  return {
    tagAffinityContribution,
    matchedTagCount: matched,
    sessionTagContribution,
    longTermTagContribution,
  }
}

/**
 * Build decaying session intent from recent Feed V2 events.
 * Does not write to user_interest_scores.
 */
export function buildSessionIntentFromEvents(
  events: Array<{
    eventType: string
    category?: string | null
    publisherId?: string | null
    articleId?: string | null
    tags?: string[] | null
    dwellMs?: number
    ageMinutes?: number
  }>
): NfSessionIntent {
  const intent = emptySessionIntent()
  for (const ev of events) {
    const decay = Math.pow(0.5, (ev.ageMinutes ?? 0) / 20) // ~20 min half-life (session faster than long-term)
    const cat = ev.category?.trim().toLowerCase()
    const pub = ev.publisherId?.trim()
    const tags = normalizeCandidateTags(ev.tags)

    if (ev.eventType === 'quick_skip' || ev.eventType === 'VERY_FAST_SWIPE') {
      if (cat) {
        intent.categoryQuickSkips.set(cat, (intent.categoryQuickSkips.get(cat) ?? 0) + 1)
      }
      for (const tag of tags) {
        intent.tagQuickSkips.set(tag, (intent.tagQuickSkips.get(tag) ?? 0) + 1)
      }
      continue
    }

    if (
      ev.eventType === 'not_interested' ||
      ev.eventType === 'hide_publisher' ||
      ev.eventType === 'NOT_INTERESTED' ||
      ev.eventType === 'HIDE_PUBLISHER'
    ) {
      if (ev.eventType.toLowerCase().includes('publisher') && pub) {
        intent.explicitNegatives.push({ targetType: 'publisher', targetId: pub })
      } else if (ev.articleId) {
        intent.explicitNegatives.push({ targetType: 'article', targetId: ev.articleId })
      } else if (cat) {
        intent.explicitNegatives.push({ targetType: 'category', targetId: cat })
      }
      continue
    }

    // Emotional reactions must NOT boost topic/tag affinity.
    if (
      ev.eventType === 'reaction_sad' ||
      ev.eventType === 'reaction_angry' ||
      ev.eventType === 'reaction_happy' ||
      ev.eventType === 'reaction_surprised' ||
      ev.eventType === 'SAD' ||
      ev.eventType === 'ANGRY' ||
      ev.eventType === 'HAPPY' ||
      ev.eventType === 'SURPRISED'
    ) {
      continue
    }

    let boost = 0
    if (ev.eventType === 'article_dwell' || ev.eventType === 'QUALIFIED_DWELL') {
      const dwell = ev.dwellMs ?? 0
      // Conservative buckets — not exact reading comprehension.
      if (dwell >= 750 && dwell < 5000) boost = 0.15
      else if (dwell >= 5000 && dwell < 20000) boost = 0.35
      else if (dwell >= 20000) boost = 0.55
    } else if (ev.eventType === 'article_open' || ev.eventType === 'HABERI_OKU') {
      boost = 0.55
    } else if (ev.eventType === 'article_save' || ev.eventType === 'SAVE') {
      boost = 0.65
    } else if (ev.eventType === 'article_share' || ev.eventType === 'SHARE') {
      boost = 0.65
    } else if (ev.eventType === 'article_comment' || ev.eventType === 'COMMENT') {
      boost = 0.6
    } else if (ev.eventType === 'publisher_follow' || ev.eventType === 'FOLLOW') {
      boost = 0.85
    } else if (ev.eventType === 'article_like' || ev.eventType === 'LIKE' || ev.eventType === 'APPLAUSE') {
      // Weak supporting only when combined with consumption — alone = tiny.
      boost = 0.08
    }

    const delta = boost * decay
    if (delta <= 0) continue
    if (cat) intent.categoryBoosts.set(cat, Math.min(1, (intent.categoryBoosts.get(cat) ?? 0) + delta))
    if (pub) intent.publisherBoosts.set(pub, Math.min(1, (intent.publisherBoosts.get(pub) ?? 0) + delta))
    // Multi-tag: share credit across tags (bounded).
    if (tags.length) {
      const perTag = delta / Math.sqrt(tags.length)
      for (const tag of tags) {
        intent.tagBoosts.set(tag, Math.min(1, (intent.tagBoosts.get(tag) ?? 0) + perTag))
      }
    }
  }
  return intent
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function qualityFeature(row: FeedCandidateRow): number {
  const tier = (row.sourceQualityTier ?? 'UNTESTED').toUpperCase()
  const tierMap: Record<string, number> = {
    PREMIUM: 1,
    TRUSTED: 0.85,
    STANDARD: 0.65,
    UNTESTED: 0.45,
    LOW: 0.25,
  }
  const tierScore = tierMap[tier] ?? 0.45
  const health = Math.min(100, Math.max(0, row.sourceHealthScore ?? 50)) / 100
  const multi = Math.min(0.2, Math.max(0, row.clusterSourceCount - 1) * 0.05)
  const verified = row.publisherVerified ? 0.08 : 0
  return clamp01(tierScore * 0.65 + health * 0.2 + multi + verified)
}

function editorialFeature(row: FeedCandidateRow): number {
  const importance = Math.min(100, Math.max(0, row.clusterImportance ?? 0)) / 100
  const breaking = row.breaking ? 0.3 : 0
  // MATERIAL_UPDATE ≠ BREAKING — soft re-entry signal only.
  const material = row.materialUpdate ? 0.12 : 0
  const featured = row.isFeatured || row.isEditorPick ? 0.15 : 0
  return clamp01(importance * 0.55 + breaking + material + featured)
}

function localFeature(row: FeedCandidateRow, ctx: FeedUserContext, mode: FeedMode): number {
  if (mode !== 'local' && !ctx.city && !ctx.districtSlug) return 0
  const userDistrict = ctx.districtSlug?.trim().toLowerCase()
  const rowDistrict = row.districtSlug?.trim().toLowerCase()
  const userCity = ctx.city?.trim().toLowerCase()
  const rowCity = row.citySlug?.trim().toLowerCase()
  if (userDistrict && rowDistrict && userDistrict === rowDistrict) return 1
  if (userCity && rowCity && userCity === rowCity) return 0.85
  if (row.source === 'LOCAL') return 0.7
  if (rowCity) return 0.35
  return 0
}

function candidateSourcesOf(row: FeedCandidateRow): FeedCandidateSource[] {
  const extra = (row as FeedCandidateRow & { candidateSources?: FeedCandidateSource[] }).candidateSources
  if (extra?.length) return [...new Set(extra)]
  return [row.source]
}

/**
 * Extract features → base relevance → diversity → exploration compose.
 * Deterministic for identical inputs (stable sort by articleId on ties).
 */
export class NFRankEngine {
  scoreOne(
    row: FeedCandidateRow,
    ctx: FeedUserContext,
    mode: FeedMode,
    session: NfSessionIntent,
    opts?: { seenArticle?: boolean; seenCluster?: boolean; nowMs?: number }
  ): { score: number; components: NfRankComponents; reason: FeedRankReason; breakdown: FeedScoreBreakdown } {
    const w = NFRANK_CONFIG_V1.baseWeights
    const sources = candidateSourcesOf(row)
    const cat = (row.category ?? '').toLowerCase()
    const nowMs = opts?.nowMs ?? Date.now()

    const followIntent = row.publisherId && feedUserContextService.isPublisherFollowed(ctx, row.publisherId)
      ? clamp01(0.75 + feedUserContextService.publisherAffinity(ctx, row.publisherId) * 0.25)
      : 0
    const publisherAffinity = row.publisherId
      ? clamp01(feedUserContextService.publisherAffinity(ctx, row.publisherId))
      : 0
    const categoryAffinity = clamp01(feedUserContextService.interestScore(ctx, row.category))
    const tags = normalizeCandidateTags(row.tags)
    const tagFeat = computeTagAffinityFeatures(tags, ctx, session)
    // topicAffinity = tag affinity only (never invent tags; empty tags → 0).
    const topicAffinity = tagFeat.tagAffinityContribution

    // Intent proxies from long-term + session (not emotion reactions).
    const sessionCat = cat ? session.categoryBoosts.get(cat) ?? 0 : 0
    const sessionPub = row.publisherId ? session.publisherBoosts.get(row.publisherId) ?? 0 : 0
    const sessionTag = tagFeat.sessionTagContribution
    const sessionIntent = clamp01(sessionCat * 0.5 + sessionPub * 0.3 + sessionTag * 0.2)

    const dwellIntent = clamp01(sessionCat * 0.5 + (row.source === 'RECENT' ? 0.05 : 0))
    const readIntent = clamp01(sessionCat * 0.4 + categoryAffinity * 0.3)
    const saveIntent = clamp01(sessionPub * 0.3 + publisherAffinity * 0.2)
    const shareIntent = clamp01(sessionPub * 0.25)

    const freshness = nfRankFreshnessScore(row.publishedAt, row.category, row.breaking, nowMs)
    const localRelevance = localFeature(row, ctx, mode)
    const editorialImportance = editorialFeature(row)
    const quality = qualityFeature(row)
    const engagement = clamp01(
      (row.likesCount * 0.02 + row.commentsCount * 0.03 + row.savesCount * 0.04 + row.sharesCount * 0.04) /
        10
    )
    const discovery = sources.includes('DISCOVERY') ? 0.85 : 0.12
    const archiveAffinity = Math.max(categoryAffinity, topicAffinity)
    const archiveRediscovery = nfRankArchiveRediscoveryScore({
      publishedAt: row.publishedAt,
      category: row.category,
      breaking: row.breaking,
      categoryAffinity: archiveAffinity,
      publisherAffinity,
      quality,
      nowMs,
    })

    let quickSkipPenalty = 0
    const skips = cat ? session.categoryQuickSkips.get(cat) ?? 0 : 0
    if (skips === 1) quickSkipPenalty = NFRANK_CONFIG_V1.singleQuickSkipPenalty
    else if (skips >= 2) quickSkipPenalty = NFRANK_CONFIG_V1.repeatedQuickSkipPenalty

    let explicitNegativePenalty = 0
    if (
      feedUserContextService.hasNegativePreference(ctx, {
        articleId: row.articleId,
        publisherId: row.publisherId,
        category: row.category,
      })
    ) {
      explicitNegativePenalty = 1
    }
    for (const neg of session.explicitNegatives) {
      if (neg.targetType === 'article' && neg.targetId === row.articleId) explicitNegativePenalty = 1
      if (neg.targetType === 'publisher' && row.publisherId && neg.targetId === row.publisherId) {
        explicitNegativePenalty = Math.max(explicitNegativePenalty, 0.9)
      }
      if (neg.targetType === 'category' && cat && neg.targetId === cat) {
        explicitNegativePenalty = Math.max(explicitNegativePenalty, 0.7)
      }
    }

    if (opts?.seenArticle && !row.materialUpdate) quickSkipPenalty = Math.max(quickSkipPenalty, 0.5)
    if (opts?.seenCluster && !row.materialUpdate) quickSkipPenalty = Math.max(quickSkipPenalty, 0.4)

    const baseScore =
      dwellIntent * w.dwellIntent +
      readIntent * w.readIntent +
      saveIntent * w.saveIntent +
      shareIntent * w.shareIntent +
      followIntent * w.followIntent +
      topicAffinity * w.topicAffinity +
      categoryAffinity * w.categoryAffinity +
      publisherAffinity * w.publisherAffinity +
      freshness * w.freshness +
      localRelevance * w.localRelevance +
      editorialImportance * w.editorialImportance +
      quality * w.quality +
      engagement * w.engagement +
      discovery * w.discovery +
      archiveRediscovery * w.archiveRediscovery -
      quickSkipPenalty * w.quickSkipPenalty -
      explicitNegativePenalty * w.explicitNegativePenalty

    const components: NfRankComponents = {
      dwellIntent,
      readIntent,
      saveIntent,
      shareIntent,
      followIntent,
      topicAffinity,
      categoryAffinity,
      publisherAffinity,
      freshness,
      localRelevance,
      editorialImportance,
      quality,
      engagement,
      discovery,
      sessionIntent,
      archiveRediscovery,
      explorationBonus: 0,
      quickSkipPenalty,
      explicitNegativePenalty,
      clusterRepeatPenalty: 0,
      publisherSaturationPenalty: 0,
      categorySaturationPenalty: 0,
      tagAffinityContribution: tagFeat.tagAffinityContribution,
      matchedTagCount: tagFeat.matchedTagCount,
      sessionTagContribution: tagFeat.sessionTagContribution,
      longTermTagContribution: tagFeat.longTermTagContribution,
      baseScore,
      finalScore: baseScore,
    }

    // Map to existing FeedScoreBreakdown for DTO compatibility.
    const breakdown: FeedScoreBreakdown = {
      following: followIntent,
      freshness,
      interest: clamp01(categoryAffinity * 0.5 + topicAffinity * 0.3 + sessionIntent * 0.2),
      local: localRelevance,
      editorial: editorialImportance,
      quality,
      engagement,
      discovery,
      featured: row.isFeatured || row.isEditorPick ? 0.6 : 0,
      popularity: engagement,
      materialUpdate: row.materialUpdate ? 0.5 : 0,
      penalties: quickSkipPenalty * w.quickSkipPenalty + explicitNegativePenalty * w.explicitNegativePenalty,
      total: baseScore,
    }

    let reason: FeedRankReason = row.source
    if (row.materialUpdate) reason = 'MATERIAL_UPDATE'
    else if (row.breaking && editorialImportance > 0.5) reason = 'BREAKING_URGENT'
    else if (followIntent > 0.5) reason = 'FOLLOWING_FRESH'
    else if (localRelevance > 0.5) reason = 'LOCAL_RELEVANT'
    else if (categoryAffinity > 0.45 || topicAffinity > 0.45) reason = 'INTEREST_MATCH'
    else if (sources.includes('DISCOVERY')) reason = 'DISCOVERY'
    else if (sources.includes('POPULAR')) reason = 'POPULAR'
    else if (editorialImportance > 0.55) reason = 'EDITORIAL_PRIORITY'
    else reason = 'RECENT'

    return { score: baseScore, components, reason, breakdown }
  }

  /**
   * Diversity / fatigue / exploration composer.
   * Same cluster: strongest protection (max 1 in window).
   */
  compose(
    candidates: FeedCandidateRow[],
    ctx: FeedUserContext,
    mode: FeedMode,
    limit: number,
    session: NfSessionIntent = emptySessionIntent(),
    opts?: {
      seenArticles?: Set<string>
      seenClusters?: Set<string>
      /** Cold start: de-emphasize personalization. */
      coldStart?: boolean
      includeExplain?: boolean
      nowMs?: number
    }
  ): NfRankedCandidate[] {
    const cfg = NFRANK_CONFIG_V1
    const nowMs = opts?.nowMs ?? Date.now()
    const scored = candidates.map((row) => {
      const seenArticle = opts?.seenArticles?.has(row.articleId) ?? false
      const seenCluster = row.clusterId ? opts?.seenClusters?.has(row.clusterId) ?? false : false
      const { score, components, reason, breakdown } = this.scoreOne(row, ctx, mode, session, {
        seenArticle,
        seenCluster,
        nowMs,
      })
      // Cold start: damp personalization, keep freshness/editorial/quality/local.
      let adj = score
      if (opts?.coldStart) {
        adj =
          components.freshness * 0.28 +
          components.editorialImportance * 0.22 +
          components.quality * 0.18 +
          components.localRelevance * 0.15 +
          components.engagement * 0.1 +
          components.discovery * 0.07
      }
      return {
        row,
        score: adj,
        components: { ...components, baseScore: adj, finalScore: adj },
        reason,
        breakdown: { ...breakdown, total: adj },
        sources: candidateSourcesOf(row),
      }
    })

    // Stable sort for determinism
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.row.articleId.localeCompare(b.row.articleId)
    })

    const picked: NfRankedCandidate[] = []
    const usedArticles = new Set<string>()
    const usedClusters = new Set<string>()
    const publisherWindow: string[] = []
    const categoryWindow: string[] = []
    const pool = [...scored]

    const targetExploration = Math.max(1, Math.floor(limit * cfg.composition.exploration))
    let explorationPicked = 0

    while (picked.length < limit && pool.length) {
      let bestIdx = -1
      let bestAdj = -Infinity

      for (let i = 0; i < pool.length; i++) {
        const item = pool[i]!
        if (usedArticles.has(item.row.articleId)) continue
        if (opts?.seenArticles?.has(item.row.articleId) && !item.row.materialUpdate) continue
        if (item.row.clusterId && usedClusters.has(item.row.clusterId)) continue
        if (
          item.row.clusterId &&
          opts?.seenClusters?.has(item.row.clusterId) &&
          !item.row.materialUpdate
        ) {
          continue
        }

        // Hard cluster: already enforced via usedClusters (maxSameClusterInWindow=1)

        let adj = item.score
        const pub = item.row.publisherId ?? '_unknown'
        const cat = (item.row.category ?? '_general').toLowerCase()

        const pubRepeats = publisherWindow.filter((p) => p === pub).length
        const catRepeats = categoryWindow.filter((c) => c === cat).length

        const pubPen =
          pubRepeats >= cfg.diversity.maxSamePublisherInWindow
            ? cfg.baseWeights.publisherSaturationPenalty * (pubRepeats + 1)
            : pubRepeats * cfg.baseWeights.publisherSaturationPenalty * 0.5
        const catPen =
          catRepeats >= cfg.diversity.maxSameCategoryInWindow
            ? cfg.baseWeights.categorySaturationPenalty * (catRepeats + 1)
            : catRepeats * cfg.baseWeights.categorySaturationPenalty * 0.5

        adj -= pubPen
        adj -= catPen

        // Exploration: soft boost for DISCOVERY when under quota and quality ok
        let explorationBonus = 0
        if (
          explorationPicked < targetExploration &&
          item.sources.includes('DISCOVERY') &&
          item.components.quality >= cfg.explorationMinQuality
        ) {
          explorationBonus = 0.08
          adj += explorationBonus
        }

        // Fresh/important slot soft preference early in feed
        if (picked.length < Math.ceil(limit * cfg.composition.freshImportant)) {
          adj += item.components.freshness * 0.05 + item.components.editorialImportance * 0.05
        }

        if (adj > bestAdj) {
          bestAdj = adj
          bestIdx = i
          // stash penalties on components via mutation of working copy
          item.components.publisherSaturationPenalty = pubPen
          item.components.categorySaturationPenalty = catPen
          item.components.clusterRepeatPenalty = 0 // hard-filtered
          item.components.explorationBonus = explorationBonus
          item.components.finalScore = adj
        }
      }

      if (bestIdx < 0) break
      const chosen = pool.splice(bestIdx, 1)[0]!
      usedArticles.add(chosen.row.articleId)
      if (chosen.row.clusterId) usedClusters.add(chosen.row.clusterId)
      if (chosen.sources.includes('DISCOVERY') && chosen.components.explorationBonus > 0) {
        explorationPicked += 1
      }

      publisherWindow.push(chosen.row.publisherId ?? '_unknown')
      categoryWindow.push((chosen.row.category ?? '_general').toLowerCase())
      if (publisherWindow.length > cfg.diversity.windowSize) publisherWindow.shift()
      if (categoryWindow.length > cfg.diversity.windowSize) categoryWindow.shift()

      const position = picked.length
      const out: NfRankedCandidate = {
        ...chosen.row,
        score: chosen.components.finalScore,
        reason: chosen.reason,
        breakdown: { ...chosen.breakdown, total: chosen.components.finalScore },
        candidateSources: chosen.sources,
      }
      if (opts?.includeExplain) {
        out.nfExplain = {
          rankingVersion: NFRANK_VERSION,
          candidateSources: chosen.sources,
          components: { ...chosen.components },
          finalScore: chosen.components.finalScore,
          position,
        }
      }
      picked.push(out)
    }

    return picked
  }
}

export const nfRankEngine = new NFRankEngine()
