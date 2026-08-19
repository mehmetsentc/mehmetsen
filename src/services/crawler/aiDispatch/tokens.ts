import { estimateTokensFromChars } from '@/lib/ai/usage/promptSize'
import type { EventAiPack, TokenEstimate } from './types'
import { crawlerAiDispatchConfig } from './flags'
import { compressPackDeterministically } from './pack'

export function estimatePackTokens(pack: EventAiPack, outputTokens?: number): TokenEstimate {
  const cfg = crawlerAiDispatchConfig()
  const estimatedInputTokens = estimateTokensFromChars(pack.packedText.length)
  const estimatedOutputTokens = outputTokens ?? cfg.estimatedOutputTokens
  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
  }
}

export function fitPackToTokenCeiling(pack: EventAiPack): {
  pack: EventAiPack
  tokens: TokenEstimate
  exceeded: boolean
} {
  const cfg = crawlerAiDispatchConfig()
  const compressed = compressPackDeterministically(pack, cfg.maxInputTokensPerEvent, (text) =>
    estimateTokensFromChars(text.length)
  )
  const tokens = estimatePackTokens(compressed)
  return {
    pack: compressed,
    tokens,
    exceeded: tokens.estimatedInputTokens > cfg.maxInputTokensPerEvent,
  }
}
