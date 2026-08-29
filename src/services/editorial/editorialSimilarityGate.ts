/**
 * Deterministic text similarity and copyright pre-publication gate.
 * NO LLM / AI calls.
 */

export type OverlapCategory = 'LOW_OVERLAP' | 'MEDIUM_OVERLAP' | 'HIGH_OVERLAP'

export interface SimilarityResult {
  similarity: number
  jaccard: number
  ngram3: number
  tokenMatchRatio: number
  overlapCategory: OverlapCategory
  flaggedForReview: boolean
}

export interface RightsCheckResult {
  allowed: boolean
  overlapCategory: OverlapCategory
  rightsStatus: string
  rightsBasis: string
  reason: string
}

const AUTHORIZED_HIGH_OVERLAP_RIGHTS = new Set([
  'LICENSED',
  'SYNDICATED',
  'PRESS_RELEASE',
  'OFFICIAL_STATEMENT',
  'PUBLIC_STATEMENT',
  'PUBLISHER_OWNED',
  'OWNED',
  'AA_FEED',
  'IHA_FEED',
  'DHA_FEED',
  'REUTERS',
  'AP',
  'AFP',
])

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function computeJaccard(tokensA: string[], tokensB: string[]): number {
  if (!tokensA.length || !tokensB.length) return 0
  const setA = new Set(tokensA)
  const setB = new Set(tokensB)
  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

export function compute3GramOverlap(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length < 3 || tokensB.length < 3) return computeJaccard(tokensA, tokensB)
  const gramsA = new Set<string>()
  for (let i = 0; i <= tokensA.length - 3; i++) {
    gramsA.add(`${tokensA[i]} ${tokensA[i + 1]} ${tokensA[i + 2]}`)
  }
  const gramsB = new Set<string>()
  for (let i = 0; i <= tokensB.length - 3; i++) {
    gramsB.add(`${tokensB[i]} ${tokensB[i + 1]} ${tokensB[i + 2]}`)
  }
  let intersection = 0
  for (const g of gramsA) {
    if (gramsB.has(g)) intersection++
  }
  const union = new Set([...gramsA, ...gramsB]).size
  return union === 0 ? 0 : intersection / union
}

export function computeTokenMatchRatio(tokensA: string[], tokensB: string[]): number {
  if (!tokensA.length || !tokensB.length) return 0
  const setB = new Set(tokensB)
  let matched = 0
  for (const t of tokensA) {
    if (setB.has(t)) matched++
  }
  return matched / Math.max(tokensA.length, 1)
}

export function checkTextSimilarity(
  canonicalText: string | null | undefined,
  rawSourceText: string | null | undefined
): SimilarityResult {
  const canTokens = tokenize(canonicalText)
  const rawTokens = tokenize(rawSourceText)

  if (canTokens.length === 0 || rawTokens.length === 0) {
    return {
      similarity: 0,
      jaccard: 0,
      ngram3: 0,
      tokenMatchRatio: 0,
      overlapCategory: 'LOW_OVERLAP',
      flaggedForReview: false,
    }
  }

  const jaccard = computeJaccard(canTokens, rawTokens)
  const ngram3 = compute3GramOverlap(canTokens, rawTokens)
  const tokenMatchRatio = computeTokenMatchRatio(canTokens, rawTokens)

  const similarity = jaccard * 0.4 + ngram3 * 0.3 + tokenMatchRatio * 0.3

  let overlapCategory: OverlapCategory = 'LOW_OVERLAP'
  if (similarity >= 0.7) {
    overlapCategory = 'HIGH_OVERLAP'
  } else if (similarity >= 0.3) {
    overlapCategory = 'MEDIUM_OVERLAP'
  }

  return {
    similarity,
    jaccard,
    ngram3,
    tokenMatchRatio,
    overlapCategory,
    flaggedForReview: overlapCategory === 'HIGH_OVERLAP',
  }
}

/**
 * Validates whether an editorial article can be published publicly based on overlap & rights metadata.
 */
export function validatePublicationRights(input: {
  canonicalText: string | null | undefined
  rawSourceText: string | null | undefined
  rightsStatus?: string | null
  rightsBasis?: string | null
  forceAllow?: boolean
}): RightsCheckResult {
  const sim = checkTextSimilarity(input.canonicalText, input.rawSourceText)
  const rightsStatus = (input.rightsStatus || 'UNKNOWN').toUpperCase()
  const rightsBasis = (input.rightsBasis || 'UNKNOWN').toUpperCase()

  if (sim.overlapCategory === 'LOW_OVERLAP') {
    return {
      allowed: true,
      overlapCategory: sim.overlapCategory,
      rightsStatus,
      rightsBasis,
      reason: 'Low source overlap; safe for standard editorial publication.',
    }
  }

  if (sim.overlapCategory === 'MEDIUM_OVERLAP') {
    return {
      allowed: true,
      overlapCategory: sim.overlapCategory,
      rightsStatus,
      rightsBasis,
      reason: 'Medium source overlap; editorial confirmation noted.',
    }
  }

  // HIGH_OVERLAP (>= 70%)
  const hasAuthorizedRights =
    AUTHORIZED_HIGH_OVERLAP_RIGHTS.has(rightsStatus) ||
    AUTHORIZED_HIGH_OVERLAP_RIGHTS.has(rightsBasis)

  if (hasAuthorizedRights || input.forceAllow) {
    return {
      allowed: true,
      overlapCategory: sim.overlapCategory,
      rightsStatus,
      rightsBasis,
      reason: 'High source overlap permitted under explicit authorized rights/syndication license.',
    }
  }

  return {
    allowed: false,
    overlapCategory: sim.overlapCategory,
    rightsStatus,
    rightsBasis,
    reason:
      'BLOCKED: High source overlap (>= 70%) without recorded rights/syndication metadata. Requires manual editorial rewrite or licensed rights basis.',
  }
}
