/**
 * Phase P16 — Deterministic Primary Source Selector
 *
 * Evaluates all member articles of an event cluster and deterministically
 * selects the highest-quality primary source for editorial publication.
 */

import type { EditorialCandidateArticle, PrimarySourceSelection } from './editorialTypes'
import { validateImageCandidate } from './imageGate'

const TIER_WEIGHTS: Record<string, number> = {
  TIER_A: 50,
  TIER_B: 35,
  TIER_C: 20,
  UNTESTED: 10,
  BLOCKED: -1000,
}

export function scoreArticleCandidate(
  article: EditorialCandidateArticle,
  now: Date = new Date()
): { score: number; reasons: string[]; bestImageUrl: string | null } {
  let score = 0
  const reasons: string[] = []

  // 1. Source Quality Tier
  const tier = (article.sourceQualityTier || 'UNTESTED').toUpperCase()
  const tierScore = TIER_WEIGHTS[tier] ?? 10
  score += tierScore
  reasons.push(`Tier ${tier}: +${tierScore}`)

  if (tier === 'BLOCKED' || article.sourceStatus === 'DISABLED') {
    return { score: -1000, reasons: ['Source is BLOCKED or DISABLED'], bestImageUrl: null }
  }

  // 2. Source Health Score (0 - 100)
  const health = Math.max(0, Math.min(100, article.sourceHealthScore ?? 50))
  const healthScore = Math.round(health * 0.3)
  score += healthScore
  reasons.push(`Health (${health}): +${healthScore}`)

  // 3. Body richness & length
  const bodyLen = (article.body || '').trim().length
  if (bodyLen >= 400) {
    score += 20
    reasons.push('Comprehensive body: +20')
  } else if (bodyLen >= 150) {
    score += 10
    reasons.push('Standard body: +10')
  } else if (bodyLen < 80) {
    score -= 30
    reasons.push('Thin body: -30')
  }

  // 4. Extraction confidence
  if (article.extractionConfidence != null && article.extractionConfidence >= 0.8) {
    score += 10
    reasons.push('High extraction confidence: +10')
  }

  // 5. Clean Hero Image
  let bestImageUrl: string | null = null
  const allImages = [article.mainImageUrl, ...(article.imageUrls || [])].filter(Boolean) as string[]
  for (const imgUrl of allImages) {
    const imgRes = validateImageCandidate(imgUrl)
    if (imgRes.valid && imgRes.url) {
      bestImageUrl = imgRes.url
      break
    }
  }

  if (bestImageUrl) {
    score += 15
    reasons.push('Clean valid image: +15')
  }

  // 6. Freshness
  const pubDate = article.publishedAt || article.fetchedAt
  if (pubDate) {
    const ageHours = Math.max(0, (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60))
    if (ageHours <= 24) {
      const freshBonus = Math.round(Math.max(0, 10 - ageHours * 0.4))
      score += freshBonus
      reasons.push(`Freshness (${ageHours.toFixed(1)}h): +${freshBonus}`)
    }
  }

  return { score, reasons, bestImageUrl }
}

export function selectPrimarySource(
  candidates: EditorialCandidateArticle[],
  now: Date = new Date()
): PrimarySourceSelection | null {
  if (!candidates || candidates.length === 0) return null

  const scored = candidates.map((cand) => {
    const { score, reasons, bestImageUrl } = scoreArticleCandidate(cand, now)
    return {
      cand,
      score,
      reasons,
      bestImageUrl,
    }
  })

  // Filter out severely invalid candidates
  const valid = scored.filter((s) => s.score > 0)
  if (valid.length === 0) {
    // Fall back to best scored candidate if any exist
    scored.sort((a, b) => b.score - a.score || a.cand.id.localeCompare(b.cand.id))
    const top = scored[0]
    return {
      primaryArticleId: top.cand.id,
      sourceId: top.cand.sourceId,
      sourceName: top.cand.sourceName,
      score: top.score,
      reasons: top.reasons,
      bestImageUrl: top.bestImageUrl,
    }
  }

  valid.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.cand.id.localeCompare(b.cand.id)
  })

  const winner = valid[0]
  return {
    primaryArticleId: winner.cand.id,
    sourceId: winner.cand.sourceId,
    sourceName: winner.cand.sourceName,
    score: winner.score,
    reasons: winner.reasons,
    bestImageUrl: winner.bestImageUrl,
  }
}
