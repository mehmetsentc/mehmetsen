/**
 * Phase 4F.3 — deterministic pre-spend quality gate (unpaid).
 * Runs BEFORE job enqueue and BEFORE any provider call.
 * Primary metric: prevent unnecessary paid AI, not maximize drafts.
 *
 * PRESPEND_REJECTED / WOULD_BLOCK ≠ DELETE — event stays; only spend is blocked.
 */

import type { AutoDraftGateResult } from './eligibility'
import type { SourceRichness } from '../canary/sourcePolicy'

export const PRESPEND_OUTCOMES = [
  'PRESPEND_READY',
  'TOO_THIN',
  'LOW_CONFIDENCE',
  'LOW_SOURCE_HEALTH',
  'STALE',
  'MALFORMED_EXTRACTION',
  'BOILERPLATE_HEAVY',
  'DUPLICATE_EVENT',
  'ALREADY_DRAFTED',
  'ALREADY_PUBLISHED',
  'UPDATE_AVAILABLE',
  'INSUFFICIENT_EVENT_EVIDENCE',
  'BUDGET_BLOCKED',
  'HISTORICAL_BLOCKED',
  'WAITING_FOR_MORE_SOURCES',
  'EDITOR_REJECTED',
  'MANUAL_ONLY',
  'COST_UNKNOWN',
  'PROVIDER_DEFERRED',
  'GATE_NOT_READY',
] as const

export type PrespendOutcome = (typeof PRESPEND_OUTCOMES)[number]

export const PRESPEND_OUTCOME_LABELS_TR: Record<PrespendOutcome, string> = {
  PRESPEND_READY: 'Harcama öncesi hazır',
  TOO_THIN: 'Metin çok kısa',
  LOW_CONFIDENCE: 'Düşük çıkarım güveni',
  LOW_SOURCE_HEALTH: 'Kaynak sağlığı düşük',
  STALE: 'Olay bayat',
  MALFORMED_EXTRACTION: 'Bozuk çıkarım',
  BOILERPLATE_HEAVY: 'Şablon metin ağırlıklı',
  DUPLICATE_EVENT: 'Yinelenen olay',
  ALREADY_DRAFTED: 'Taslak zaten var',
  ALREADY_PUBLISHED: 'Zaten yayınlanmış',
  UPDATE_AVAILABLE: 'Materyal güncellemesi var',
  INSUFFICIENT_EVENT_EVIDENCE: 'Olay kanıtı yetersiz',
  BUDGET_BLOCKED: 'Bütçe engeli',
  HISTORICAL_BLOCKED: 'Kesim tarihi öncesi',
  WAITING_FOR_MORE_SOURCES: 'Daha fazla kaynak bekleniyor',
  EDITOR_REJECTED: 'Editör reddetti',
  MANUAL_ONLY: 'Yalnızca manuel',
  COST_UNKNOWN: 'Maliyet bilinmiyor',
  PROVIDER_DEFERRED: 'Sağlayıcı ertelendi',
  GATE_NOT_READY: 'Kapı henüz hazır değil',
}

export type PrespendGateInput = {
  gate: AutoDraftGateResult
  bestWordCount: number
  bestConfidence: number
  avgHealth: number
  staleHours: number
  independentSourceCount: number
  usableSourceWords: number
  richness: SourceRichness
  /** Fraction of body that looks like boilerplate (0–1). */
  boilerplateRatio: number
  /** Extraction missing body / title / empty pack. */
  malformedExtraction: boolean
  costUnknown: boolean
  budgetBlocked: boolean
  historicalBlocked: boolean
  hasActiveAiJob: boolean
  hasCompletedDraft: boolean
  publishedNewsId?: string | null
  exactDuplicateOnly: boolean
}

export type PrespendGateResult = {
  outcome: PrespendOutcome
  readyToSpend: boolean
  /** True when outcome is a reject — never deletes the event. */
  rejected: boolean
  reason: string
  labelTr: string
}

const BOILERPLATE_MAX = 0.55
const CONFIDENCE_MIN = 0.55
const HEALTH_MIN = 45
const EVIDENCE_WORDS_MIN = 100

/**
 * Deterministic pre-spend evaluation. Order: hard blocks → quality → ready.
 * Does not call LLM. Does not mutate editorial_decision.
 */
export function evaluatePrespendGate(input: PrespendGateInput): PrespendGateResult {
  const fail = (outcome: PrespendOutcome, reason: string): PrespendGateResult => ({
    outcome,
    readyToSpend: false,
    rejected: true,
    reason,
    labelTr: PRESPEND_OUTCOME_LABELS_TR[outcome],
  })

  if (input.publishedNewsId) {
    return fail('ALREADY_PUBLISHED', 'published_news_id')
  }
  if (input.exactDuplicateOnly) {
    return fail('DUPLICATE_EVENT', 'exact_duplicate_only')
  }
  if (input.hasCompletedDraft && input.gate.status === 'UPDATE_AVAILABLE') {
    return fail('UPDATE_AVAILABLE', 'material_update_after_draft')
  }
  if (input.hasCompletedDraft || input.hasActiveAiJob) {
    return fail('ALREADY_DRAFTED', input.hasActiveAiJob ? 'active_ai_job' : 'existing_ai_draft')
  }
  if (input.gate.status === 'EDITOR_REJECTED') {
    return fail('EDITOR_REJECTED', 'editorial_decision')
  }
  if (input.gate.status === 'MANUAL_ONLY') {
    return fail('MANUAL_ONLY', 'manual_only_flag')
  }
  if (input.historicalBlocked) {
    return fail('HISTORICAL_BLOCKED', 'before_activation_cutoff')
  }
  if (input.costUnknown) {
    return fail('COST_UNKNOWN', 'pricing_undefined')
  }
  if (input.budgetBlocked) {
    return fail('BUDGET_BLOCKED', 'budget_or_concurrency')
  }
  const effectiveWords = Math.max(input.bestWordCount, input.usableSourceWords)

  if (input.malformedExtraction) {
    return fail('MALFORMED_EXTRACTION', 'empty_or_broken_extraction')
  }
  if (input.gate.status === 'TOO_THIN' || effectiveWords < 80) {
    return fail('TOO_THIN', 'too_thin_body')
  }
  if (input.bestConfidence < CONFIDENCE_MIN) {
    return fail('LOW_CONFIDENCE', 'extraction_confidence_low')
  }
  if (input.avgHealth < HEALTH_MIN) {
    return fail('LOW_SOURCE_HEALTH', 'source_health_low')
  }
  if (input.gate.status === 'STALE' || input.staleHours > 72) {
    return fail('STALE', 'stale_event')
  }
  if (input.boilerplateRatio > BOILERPLATE_MAX) {
    return fail('BOILERPLATE_HEAVY', 'boilerplate_ratio_high')
  }
  if (
    (input.richness === 'insufficient' && effectiveWords < EVIDENCE_WORDS_MIN) ||
    effectiveWords < EVIDENCE_WORDS_MIN ||
    input.gate.status === 'WAITING_FOR_MORE_SOURCES'
  ) {
    if (input.gate.status === 'WAITING_FOR_MORE_SOURCES') {
      return fail('WAITING_FOR_MORE_SOURCES', input.gate.reason)
    }
    return fail('INSUFFICIENT_EVENT_EVIDENCE', 'insufficient_usable_words')
  }
  if (!input.gate.readyForJob) {
    return fail('GATE_NOT_READY', input.gate.reason || input.gate.status)
  }

  return {
    outcome: 'PRESPEND_READY',
    readyToSpend: true,
    rejected: false,
    reason: 'prespend_quality_ok',
    labelTr: PRESPEND_OUTCOME_LABELS_TR.PRESPEND_READY,
  }
}

/** Cheap boilerplate heuristic: nav/cookie/footer-ish repeated lines. */
export function estimateBoilerplateRatio(text: string): number {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 12)
  if (lines.length < 4) return 0
  const boilerplateRe =
    /cookie|çerez|abone ol|tüm hakları|copyright|gizlilik|reklam|javascript|enable javascript|follow us|bizi takip/i
  let hits = 0
  for (const line of lines) {
    if (boilerplateRe.test(line) || line.length < 20) hits += 1
  }
  return Math.min(1, hits / lines.length)
}
