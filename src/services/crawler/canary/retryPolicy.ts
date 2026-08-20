/**
 * Canary retry policy — bounded and status-aware.
 * 401/402: never retry. Validation deterministic-fixable: no AI retry.
 * Budget/config: no retry. 429/5xx: at most one bounded retry if safe.
 */

export type RetryDecision = {
  retry: boolean
  reason: string
  openCircuit?: boolean
  adminWarningTr?: string
}

export function canaryRetryDecision(statusCode: number | undefined, opts?: {
  alreadyRetried?: boolean
  validationDeterministicFixable?: boolean
  budgetOrConfigBlock?: boolean
}): RetryDecision {
  if (opts?.budgetOrConfigBlock) {
    return { retry: false, reason: 'budget_or_config' }
  }
  if (opts?.validationDeterministicFixable) {
    return { retry: false, reason: 'deterministic_validation_fix' }
  }
  if (statusCode === 401) {
    return {
      retry: false,
      reason: 'auth_401',
      openCircuit: true,
      adminWarningTr: 'DeepSeek kimlik doğrulama hatası (401). Canary durdu; tekrar deneme yok.',
    }
  }
  if (statusCode === 402) {
    return {
      retry: false,
      reason: 'insufficient_balance_402',
      openCircuit: true,
      adminWarningTr: 'DeepSeek bakiye yetersiz (402). Canary durdu; crawler etkilenmez.',
    }
  }
  if (statusCode === 429 || (statusCode != null && statusCode >= 500 && statusCode <= 599)) {
    if (opts?.alreadyRetried) {
      return { retry: false, reason: 'bounded_retry_exhausted' }
    }
    return { retry: true, reason: statusCode === 429 ? 'rate_limit_once' : 'server_error_once' }
  }
  return { retry: false, reason: 'no_retry' }
}

export function canaryRetryBackoffMs(): number {
  return 750
}
