export const GENERATION_REASONS = [
  'initial',
  'continuation',
  'quality_retry',
  'provider_retry',
  'pipeline_retry',
  'manual_retry',
  'unknown',
] as const

export type GenerationReason = (typeof GENERATION_REASONS)[number]

export function normalizeGenerationReason(raw: unknown): GenerationReason {
  if (typeof raw === 'string' && (GENERATION_REASONS as readonly string[]).includes(raw)) {
    return raw as GenerationReason
  }
  return 'unknown'
}

export function classifySecondStage1Call(opts: {
  sameInputHash: boolean
  attempt: number
  generationReason?: GenerationReason | null
}): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' {
  const reason = opts.generationReason ?? 'unknown'
  if (reason === 'continuation') return 'A'
  if (reason === 'quality_retry' || reason === 'pipeline_retry') return 'B'
  if (reason === 'provider_retry' || (opts.sameInputHash && opts.attempt > 1)) return 'C'
  if (reason === 'initial' && !opts.sameInputHash) return 'D'
  if (reason === 'manual_retry') return 'E'
  if (opts.sameInputHash && opts.attempt === 1) return 'E'
  return 'F'
}
