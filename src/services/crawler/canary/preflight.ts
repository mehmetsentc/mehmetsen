import { estimateTokensFromChars } from '@/lib/ai/usage/promptSize'
import { estimateUsageCost, getDeepSeekPricing } from '@/lib/ai/usage/pricing'
import { buildCanaryEvidencePack } from './pack'
import { evaluateCanarySelection } from './selection'
import { assertCanarySafetyFlags, canaryConfig } from './flags'
import { buildCanarySystemPrompt, buildCanaryUserPrompt } from './prompt'
import type {
  CanaryBlockReason,
  CanaryClusterInput,
  CanaryEvidencePack,
  CanaryMemberInput,
  CanaryPreflight,
} from './types'
import { APPROVED_FOR_REAL_CANARY_EXECUTION } from './types'

export type CanaryPricingProbe = {
  known: boolean
  model: string
  inputCostPer1M: number | null
  outputCostPer1M: number | null
  reason?: 'COST_UNKNOWN'
}

export function probeCanaryPricing(model = canaryConfig().model): CanaryPricingProbe {
  const pricing = getDeepSeekPricing(model)
  const known =
    pricing.inputPerMillionUsd !== undefined && pricing.outputPerMillionUsd !== undefined
  if (!known) {
    return {
      known: false,
      model,
      inputCostPer1M: pricing.inputPerMillionUsd ?? null,
      outputCostPer1M: pricing.outputPerMillionUsd ?? null,
      reason: 'COST_UNKNOWN',
    }
  }
  return {
    known: true,
    model,
    inputCostPer1M: pricing.inputPerMillionUsd!,
    outputCostPer1M: pricing.outputPerMillionUsd!,
  }
}

export function estimateCanaryPromptTokens(pack: CanaryEvidencePack): {
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedTotalTokens: number
} {
  const cfg = canaryConfig()
  const system = buildCanarySystemPrompt()
  const user = buildCanaryUserPrompt(pack)
  const estimatedInputTokens = estimateTokensFromChars(system.length + user.length)
  const estimatedOutputTokens = cfg.estimatedOutputTokens
  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
  }
}

export function estimateCanaryCostUsd(inputTokens: number, outputTokens: number, model = canaryConfig().model): {
  known: boolean
  estimatedCostUsd: number | null
  reason?: 'COST_UNKNOWN'
} {
  const pricing = getDeepSeekPricing(model)
  if (pricing.inputPerMillionUsd === undefined || pricing.outputPerMillionUsd === undefined) {
    return { known: false, estimatedCostUsd: null, reason: 'COST_UNKNOWN' }
  }
  const est = estimateUsageCost(
    { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    pricing
  )
  return { known: true, estimatedCostUsd: est.estimatedTotalCostUsd ?? null }
}

export type BuildPreflightInput = {
  cluster: CanaryClusterInput
  members: CanaryMemberInput[]
  now?: Date
  existingJob?: boolean
  existingDraftId?: string | null
  /** Human confirmation for paid path — Stage 1 never spends. */
  confirmation?: string | null
}

export function buildCanaryPreflight(input: BuildPreflightInput): {
  preflight: CanaryPreflight
  pack: CanaryEvidencePack | null
} {
  const cfg = canaryConfig()
  const now = input.now ?? new Date()
  const safety = assertCanarySafetyFlags()
  const selection = evaluateCanarySelection(input.cluster, input.members, now)
  const pricing = probeCanaryPricing(cfg.model)

  const base: CanaryPreflight = {
    clusterId: input.cluster.id,
    eventKey: input.cluster.eventKey,
    state: 'PREFLIGHT',
    blockedReason: null,
    ready: false,
    provider: 'deepseek',
    model: cfg.model,
    pricingKnown: pricing.known,
    inputCostPer1M: pricing.inputCostPer1M,
    outputCostPer1M: pricing.outputCostPer1M,
    estimatedInputTokens: 0,
    estimatedOutputTokens: cfg.estimatedOutputTokens,
    estimatedTotalTokens: 0,
    estimatedCostUsd: null,
    maxCostUsdPerEvent: cfg.maxCostUsdPerEvent,
    autoPublish: false,
    autoPublishLabelTr: 'KAPALI',
    sources: [],
    packMetrics: {
      sourceCount: 0,
      primaryPresent: false,
      supportingCount: 0,
      maxSources: 3,
      htmlCharsRemoved: 0,
      rssSnippetExcludedCount: 0,
      duplicateParagraphsDropped: 0,
      packedChars: 0,
      packedTokensEstimate: 0,
      sourceOnce: true,
    },
    selection,
    confirmationRequired: APPROVED_FOR_REAL_CANARY_EXECUTION,
    approvedForAiInsufficient: true,
    requestLimits: {
      maxEvents: 1,
      concurrency: 1,
      initialRequests: 1,
      maxWithRepair: 2,
    },
    globalFlags: {
      crawlerAiDispatchEnabled: safety.crawlerAiDispatchEnabled,
      legacyDirectAiEnabled: safety.legacyDirectAiEnabled,
    },
  }

  const block = (reason: CanaryBlockReason): { preflight: CanaryPreflight; pack: CanaryEvidencePack | null } => ({
    preflight: { ...base, state: 'BLOCKED', blockedReason: reason, ready: false },
    pack: null,
  })

  if (safety.crawlerAiDispatchEnabled) return block('DISPATCH_MUST_STAY_OFF')
  if (safety.legacyDirectAiEnabled) return block('LEGACY_AI_MUST_STAY_OFF')
  if (input.existingDraftId) return block('EXISTING_DRAFT')
  if (input.existingJob) return block('EXISTING_JOB')
  if (input.cluster.publishedNewsId) return block('ALREADY_PUBLISHED')
  if (
    input.members.some((m) => m.editorialStatus === 'PUBLISHED' && m.editorialNewsId)
  ) {
    return block('ALREADY_PUBLISHED')
  }

  if (!selection.isCandidate) {
    if (selection.avoidReasons.includes('stale')) return block('STALE_EVENT')
    if (selection.avoidReasons.some((r) =>
      ['death', 'disaster', 'terrorism', 'crime_allegation', 'medical', 'election', 'high_risk_breaking'].includes(r)
    )) {
      return block('SENSITIVE_TOPIC')
    }
    if (selection.avoidReasons.includes('no_clean_body')) return block('NO_USABLE_BODY')
    return block('NOT_CANARY_CANDIDATE')
  }

  const pack = buildCanaryEvidencePack(input.cluster, input.members, now)
  if (pack.sources.length === 0) return block('NO_USABLE_BODY')
  if (!pack.metrics.primaryPresent) return block('NO_VALID_SOURCE')

  const tokens = estimateCanaryPromptTokens(pack)
  base.estimatedInputTokens = tokens.estimatedInputTokens
  base.estimatedOutputTokens = tokens.estimatedOutputTokens
  base.estimatedTotalTokens = tokens.estimatedTotalTokens
  base.sources = pack.sources.map((s) => ({
    role: s.role,
    sourceName: s.sourceName,
    title: s.title,
  }))
  base.packMetrics = pack.metrics

  if (tokens.estimatedInputTokens > cfg.maxInputTokens) {
    return {
      preflight: {
        ...base,
        state: 'BLOCKED',
        blockedReason: 'TOKEN_CEILING_EXCEEDED',
        ready: false,
      },
      pack,
    }
  }

  if (!pricing.known) {
    return {
      preflight: {
        ...base,
        state: 'BLOCKED',
        blockedReason: 'COST_UNKNOWN',
        ready: false,
      },
      pack,
    }
  }

  const cost = estimateCanaryCostUsd(tokens.estimatedInputTokens, tokens.estimatedOutputTokens, cfg.model)
  base.estimatedCostUsd = cost.estimatedCostUsd
  if (!cost.known || cost.estimatedCostUsd == null) {
    return {
      preflight: { ...base, state: 'BLOCKED', blockedReason: 'COST_UNKNOWN', ready: false },
      pack,
    }
  }
  if (cost.estimatedCostUsd > cfg.maxCostUsdPerEvent + 1e-12) {
    return {
      preflight: {
        ...base,
        state: 'BLOCKED',
        blockedReason: 'EVENT_COST_LIMIT_EXCEEDED',
        ready: false,
      },
      pack,
    }
  }

  // Preflight READY means human may review panel — NOT authorized to spend yet.
  // Paid execution separately requires APPROVED_FOR_REAL_CANARY_EXECUTION.
  const confirmationOk = input.confirmation === APPROVED_FOR_REAL_CANARY_EXECUTION
  if (input.confirmation && input.confirmation !== APPROVED_FOR_REAL_CANARY_EXECUTION) {
    if (input.confirmation === 'APPROVED_FOR_AI') {
      return {
        preflight: {
          ...base,
          state: 'BLOCKED',
          blockedReason: 'APPROVED_FOR_AI_NOT_SUFFICIENT',
          ready: false,
        },
        pack,
      }
    }
  }

  return {
    preflight: {
      ...base,
      state: 'READY',
      blockedReason: confirmationOk ? null : null,
      ready: true,
    },
    pack,
  }
}
