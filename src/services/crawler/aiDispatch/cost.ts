import { estimateUsageCost, getModelPricing } from '@/lib/ai/usage/pricing'
import { crawlerAiDispatchConfig } from './flags'
import type { CostEstimate, TokenEstimate } from './types'

export function estimateDispatchCost(tokens: TokenEstimate, pipelineTokens?: number): CostEstimate {
  const cfg = crawlerAiDispatchConfig()
  const pricing = getModelPricing(cfg.provider, cfg.model)
  const known =
    pricing.inputPerMillionUsd !== undefined && pricing.outputPerMillionUsd !== undefined
  if (!known) {
    return {
      known: false,
      estimatedCostUsd: null,
      pipelineCostUsd: null,
      pipelineTokens: pipelineTokens ?? Math.round(tokens.estimatedTotalTokens * cfg.pipelineCostMultiplier),
      provider: cfg.provider,
      model: cfg.model,
      reason: 'COST_UNKNOWN',
    }
  }

  const stage = estimateUsageCost(
    {
      inputTokens: tokens.estimatedInputTokens,
      outputTokens: tokens.estimatedOutputTokens,
      totalTokens: tokens.estimatedTotalTokens,
    },
    pricing
  )
  const pipelineTok = pipelineTokens ?? Math.round(tokens.estimatedTotalTokens * cfg.pipelineCostMultiplier)
  const pipelineIn = Math.round(tokens.estimatedInputTokens * cfg.pipelineCostMultiplier)
  const pipelineOut = Math.round(tokens.estimatedOutputTokens * cfg.pipelineCostMultiplier)
  const pipeline = estimateUsageCost(
    {
      inputTokens: pipelineIn,
      outputTokens: pipelineOut,
      totalTokens: pipelineTok,
    },
    pricing
  )

  return {
    known: true,
    estimatedCostUsd: stage.estimatedTotalCostUsd ?? null,
    pipelineCostUsd: pipeline.estimatedTotalCostUsd ?? null,
    pipelineTokens: pipelineTok,
    provider: cfg.provider,
    model: cfg.model,
  }
}

export function reservationUsd(cost: CostEstimate): number | null {
  if (!cost.known) return null
  return cost.pipelineCostUsd ?? cost.estimatedCostUsd
}
