import type { NormalizedAiUsage } from '@/lib/ai/usage/types'

export type ModelPricing = {
  provider: string
  model: string
  inputPerMillionUsd?: number
  outputPerMillionUsd?: number
  cacheHitInputPerMillionUsd?: number
  cacheMissInputPerMillionUsd?: number
}

export type EstimatedAiCost = {
  estimatedInputCostUsd?: number
  estimatedOutputCostUsd?: number
  estimatedCacheCostUsd?: number
  estimatedTotalCostUsd?: number
}

function parseRate(envName: string): number | undefined {
  const raw = process.env[envName]?.trim()
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

/** Env-driven only. Never guess DeepSeek list prices. */
export function getDeepSeekPricing(model: string): ModelPricing {
  return {
    provider: 'deepseek',
    model,
    inputPerMillionUsd: parseRate('DEEPSEEK_INPUT_COST_PER_1M'),
    outputPerMillionUsd: parseRate('DEEPSEEK_OUTPUT_COST_PER_1M'),
    cacheHitInputPerMillionUsd: parseRate('DEEPSEEK_CACHE_HIT_COST_PER_1M'),
    cacheMissInputPerMillionUsd: parseRate('DEEPSEEK_CACHE_MISS_COST_PER_1M'),
  }
}

export function getModelPricing(provider: string, model: string): ModelPricing {
  if (provider === 'deepseek') return getDeepSeekPricing(model)
  return { provider, model }
}

function usdFromTokens(tokens: number | undefined, perMillion: number | undefined): number | undefined {
  if (tokens === undefined || perMillion === undefined) return undefined
  return (tokens / 1_000_000) * perMillion
}

/**
 * Estimated cost from provider usage + env rates.
 * If rates are unset, all cost fields stay undefined (tokens still recorded).
 */
export function estimateUsageCost(
  usage: NormalizedAiUsage | undefined,
  pricing: ModelPricing
): EstimatedAiCost {
  if (!usage) return {}

  const outputCost = usdFromTokens(usage.outputTokens, pricing.outputPerMillionUsd)

  const cacheHitRate = pricing.cacheHitInputPerMillionUsd
  const cacheMissRate = pricing.cacheMissInputPerMillionUsd
  const hasCacheRates = cacheHitRate !== undefined || cacheMissRate !== undefined

  let inputCost: number | undefined
  let cacheCost: number | undefined

  if (hasCacheRates && (usage.cacheHitTokens !== undefined || usage.cacheMissTokens !== undefined)) {
    const hitCost = usdFromTokens(usage.cacheHitTokens, cacheHitRate)
    const missCost = usdFromTokens(usage.cacheMissTokens, cacheMissRate)
    const parts = [hitCost, missCost].filter((n): n is number => n !== undefined)
    if (parts.length > 0) {
      cacheCost = parts.reduce((a, b) => a + b, 0)
      inputCost = cacheCost
    }
  } else {
    inputCost = usdFromTokens(usage.inputTokens, pricing.inputPerMillionUsd)
  }

  const totalParts = [inputCost, outputCost].filter((n): n is number => n !== undefined)
  const estimatedTotalCostUsd = totalParts.length > 0 ? totalParts.reduce((a, b) => a + b, 0) : undefined

  return {
    ...(inputCost !== undefined ? { estimatedInputCostUsd: inputCost } : {}),
    ...(outputCost !== undefined ? { estimatedOutputCostUsd: outputCost } : {}),
    ...(cacheCost !== undefined ? { estimatedCacheCostUsd: cacheCost } : {}),
    ...(estimatedTotalCostUsd !== undefined ? { estimatedTotalCostUsd } : {}),
  }
}
