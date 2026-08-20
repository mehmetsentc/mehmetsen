/**
 * Phase 4C.2 — paid AI repair eligibility.
 * BODY_TOO_SHORT / insufficient / grounding / cost-auth failures → NO paid repair.
 * Only structural JSON/format issues may request one bounded repair.
 */

export const PAID_REPAIR_BLOCKED_CODES = new Set([
  'BODY_TOO_SHORT',
  'BODY_TOO_LONG',
  'BODY_ABSOLUTE_TOO_SHORT',
  'INSUFFICIENT_SOURCE_MATERIAL',
  'FACTUAL_GROUNDING_FAILURE',
  'COST_UNKNOWN',
  'EVENT_COST_LIMIT_EXCEEDED',
  'AUTH_401',
  'INSUFFICIENT_BALANCE_402',
  'RATE_LIMIT',
  'REQUIRED',
  'LENGTH',
  'TAG_COUNT',
  'INVALID_SLUG',
  'INVALID_IMAGE_FILENAME',
  'INVALID_CATEGORY',
  'OUTPUT_TRUNCATED',
])

export const STRUCTURAL_REPAIR_CODES = new Set([
  'NOT_JSON',
  'json_parse_failed',
  'not_json',
  'empty',
  'MALFORMED_JSON',
  'MISSING_JSON_CLOSE',
])

export function isPaidRepairBlockedCode(code: string): boolean {
  return PAID_REPAIR_BLOCKED_CODES.has(code)
}

export function isStructuralRepairCode(code: string): boolean {
  return STRUCTURAL_REPAIR_CODES.has(code)
}

/**
 * Paid schema repair only when JSON is structurally broken / unparseable.
 * Semantic length/content failures must NOT spend a second DeepSeek call.
 */
export function shouldAttemptPaidSchemaRepair(input: {
  validationOk: boolean
  issueCodes: string[]
  jsonParseOk: boolean
  alreadyRepaired: boolean
  requestCount: number
  maxRequests: number
}): { repair: boolean; reason: string } {
  if (input.validationOk) return { repair: false, reason: 'already_valid' }
  if (input.alreadyRepaired) return { repair: false, reason: 'repair_already_used' }
  if (input.requestCount >= input.maxRequests) return { repair: false, reason: 'request_cap' }

  if (input.issueCodes.some(isPaidRepairBlockedCode)) {
    return { repair: false, reason: 'semantic_or_policy_failure_no_paid_repair' }
  }

  // JSON parse failed → structural repair eligible
  if (!input.jsonParseOk) {
    return { repair: true, reason: 'malformed_json' }
  }

  // Parseable JSON with only structural-ish codes (rare if parse ok)
  if (input.issueCodes.length > 0 && input.issueCodes.every(isStructuralRepairCode)) {
    return { repair: true, reason: 'structural_codes' }
  }

  // Parseable but still invalid without blocked codes → prefer local repair only
  return { repair: false, reason: 'local_repair_only' }
}
