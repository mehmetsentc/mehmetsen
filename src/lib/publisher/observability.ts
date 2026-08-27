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
  | 'publisher_profile_updated'
  | 'publisher_layout_draft_saved'
  | 'publisher_layout_published'
  | 'publisher_layout_rollback'
  | 'publisher_layout_section_created'
  | 'publisher_layout_section_deleted'
  | 'publisher_content_created'
  | 'publisher_content_published'
  | 'publisher_content_source_imported'
  | 'publisher_draft_created'
  | 'publisher_autosave'
  | 'publisher_review_submitted'
  | 'publisher_content_approved'
  | 'publisher_publish_attempt'
  | 'publisher_publish_success'
  | 'publisher_publish_partial'
  | 'publisher_publish_failed'
  | 'publisher_schedule_claimed'
  | 'publisher_schedule_published'
  | 'publisher_schedule_failed'
  | 'publisher_reconcile_attempt'
  | 'publisher_reconcile_healed'
  | 'publisher_reconcile_failed'
  | 'publisher_source_imported'
  | 'publisher_media_uploaded'
  | 'publisher_publish_firestore_failed'
  | 'publisher_publish_postgres_failed'
  | 'publisher_ad_inventory_created'
  | 'publisher_ad_inventory_updated'
  | 'publisher_ad_inventory_archived'
  | 'publisher_ad_inventory_sale_toggled'

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
