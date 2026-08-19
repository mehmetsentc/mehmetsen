export type SourceTestOutcome =
  | 'DISCOVERY_OK'
  | 'EXTRACTION_OK'
  | 'PARTIAL'
  | 'JS_REQUIRED'
  | 'BLOCKED'
  | 'NO_ARTICLES'
  | 'FAILED'

export type CrawlerQualityTier = 'TIER_A' | 'TIER_B' | 'TIER_C' | 'BLOCKED' | 'UNTESTED'

export function classifySourceTest(input: {
  discovered: number
  fetchedOk: number
  extractedOk: number
  avgWords: number
  avgConfidence: number
  imageRate: number
  dateRate: number
  blocked: boolean
  jsLikely: boolean
}): { outcome: SourceTestOutcome; tier: CrawlerQualityTier } {
  if (input.blocked) return { outcome: 'BLOCKED', tier: 'BLOCKED' }
  if (input.discovered <= 0) return { outcome: 'NO_ARTICLES', tier: 'BLOCKED' }
  if (input.fetchedOk <= 0) return { outcome: 'FAILED', tier: 'BLOCKED' }
  if (input.jsLikely && input.extractedOk === 0) return { outcome: 'JS_REQUIRED', tier: 'TIER_C' }
  if (input.extractedOk <= 0) return { outcome: 'FAILED', tier: 'BLOCKED' }

  const complete = input.avgWords >= 150 && input.avgConfidence >= 0.7 && input.imageRate >= 0.5 && input.dateRate >= 0.5
  if (complete && input.extractedOk === input.fetchedOk && input.extractedOk > 0) {
    return { outcome: 'EXTRACTION_OK', tier: 'TIER_A' }
  }
  if (input.avgWords >= 120 && input.avgConfidence >= 0.45) {
    return { outcome: input.jsLikely ? 'JS_REQUIRED' : 'PARTIAL', tier: input.jsLikely ? 'TIER_C' : 'TIER_B' }
  }
  if (input.jsLikely) return { outcome: 'JS_REQUIRED', tier: 'TIER_C' }
  return { outcome: 'PARTIAL', tier: 'TIER_C' }
}
