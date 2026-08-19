import type { CrawlPriorityBand, CrawlerQualityTier, GeographicScope } from '../types'

export interface ImportanceInput {
  uniqueSourceCount: number
  highQualitySourceCount: number
  articleCount: number
  exactDuplicateCount: number
  avgHealth: number
  avgConfidence: number
  crawlPriority: CrawlPriorityBand
  freshnessHours: number
  geographicScope: GeographicScope
  hasCity: boolean
  hasDistrict: boolean
  localSourceCount: number
  nationalSourceCount: number
  countryCount: number
  publicationVelocityPerHour: number
}

export interface ImportanceResult {
  importanceScore: number
  globalImportance: number
  nationalImportance: number
  localImportance: number
  freshnessScore: number
  sourceDiversityScore: number
  breakdown: Record<string, number>
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function scoreEventImportance(input: ImportanceInput): ImportanceResult {
  const independent = Math.max(0, input.uniqueSourceCount)
  const diversity = clamp(
    independent * 18 + input.highQualitySourceCount * 8 - input.exactDuplicateCount * 6,
    0,
    100
  )
  const freshness = clamp(100 - input.freshnessHours * 6, 8, 100)
  const velocity = clamp(input.publicationVelocityPerHour * 25, 0, 30)
  const quality = clamp(input.avgHealth * 0.35 + input.avgConfidence * 40, 0, 40)
  const priorityBoost =
    input.crawlPriority === 'BREAKING' ? 18 : input.crawlPriority === 'HIGH' ? 10 : input.crawlPriority === 'LOW' ? 0 : 5

  const national = clamp(
    independent * 16 + quality + freshness * 0.25 + (input.nationalSourceCount >= 2 ? 12 : 0) + priorityBoost,
    0,
    100
  )
  const localBase = input.hasDistrict || input.hasCity || input.geographicScope === 'CITY' || input.geographicScope === 'DISTRICT'
  const local = localBase
    ? clamp(
        28 +
          input.localSourceCount * 22 +
          quality * 0.6 +
          freshness * 0.3 +
          (input.hasDistrict ? 10 : 0) +
          (independent >= 1 && input.avgConfidence >= 0.7 ? 12 : 0),
        0,
        100
      )
    : clamp(independent * 8 + freshness * 0.15, 0, 40)
  const global = clamp(input.countryCount * 20 + independent * 10 + (input.countryCount >= 2 ? 15 : 0), 0, 100)

  const importance = clamp(
    Math.round(Math.max(national * 0.45, local * 0.4, global * 0.25) + diversity * 0.15 + velocity * 0.2),
    0,
    100
  )

  return {
    importanceScore: importance,
    globalImportance: Math.round(global),
    nationalImportance: Math.round(national),
    localImportance: Math.round(local),
    freshnessScore: Number((freshness / 100).toFixed(4)),
    sourceDiversityScore: Number((diversity / 100).toFixed(4)),
    breakdown: {
      independentSources: independent,
      highQualitySources: input.highQualitySourceCount,
      diversity,
      freshness,
      velocity,
      quality,
      priorityBoost,
    },
  }
}

export function isHighQualityTier(tier: CrawlerQualityTier): boolean {
  return tier === 'TIER_A' || tier === 'TIER_B'
}
