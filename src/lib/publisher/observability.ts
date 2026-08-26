/**
 * Publisher platform observability — never log verification_payload or secrets.
 */
const SENSITIVE_KEYS = /payload|token|secret|password|email/i

export type PublisherObservabilityEvent =
  | 'publisher_bootstrap_created'
  | 'publisher_bootstrap_matched'
  | 'publisher_bootstrap_collision'
  | 'publisher_bootstrap_ambiguous'
  | 'publisher_bootstrap_error'
  | 'PUBLISHER_CLAIM_REQUESTED'
  | 'PUBLISHER_CLAIM_APPROVED'
  | 'PUBLISHER_CLAIM_REJECTED'
  | 'PUBLISHER_OWNER_CREATED'

export function publisherLog(
  event: PublisherObservabilityEvent,
  meta?: Record<string, unknown>
): void {
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta ?? {})) {
    if (SENSITIVE_KEYS.test(k)) continue
    if (k === 'verificationPayload' || k === 'verification_payload') continue
    safe[k] = v
  }
  console.info(`[publisher] ${event}`, safe)
}
