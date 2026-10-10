/**
 * Social management audit log → existing `cmsAuditLogs` collection
 * (same shape as Newsroom OS audit entries).
 *
 * Every payload passes through redactSecrets(): token-like keys and values,
 * OAuth codes/states/URLs and ciphertext never reach the audit log.
 * Audit failures are logged (without payload) and never break the action.
 */
import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export type SocialAuditAction =
  | 'social.legacy_token.update'
  | 'social.account.create'
  | 'social.account.status'
  | 'social.account.connect'
  | 'social.account.disconnect'
  | 'social.oauth.start'
  | 'social.oauth.callback'
  | 'social.publish'
  | 'social.publish.manual'
  | 'social.publish.uncertain_ack'
  | 'social.automation.rule_create'
  | 'social.automation.rule_update'
  | 'social.automation.rule_enable'
  | 'social.automation.rule_disable'
  | 'social.automation.rule_delete'
  | 'social.automation.legacy_handoff'
  | 'social.automation.legacy_handback'
  | 'social.automation.publish'

export interface SocialAuditEntry {
  actorId: string
  actorType?: 'HUMAN' | 'SYSTEM'
  action: SocialAuditAction
  entityType: 'socialAccount' | 'socialConfig' | 'socialOAuth' | 'socialAutomationRule' | 'socialAutomationJob'
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  meta?: Record<string, unknown> | null
}

export { REDACTED, redactSecrets } from '../redact'
import { redactSecrets } from '../redact'

export function buildSocialAuditRecord(entry: SocialAuditEntry, now = Date.now()): Record<string, unknown> {
  return {
    actorType: entry.actorType ?? 'HUMAN',
    actorId: entry.actorId,
    actorLabel: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ? redactSecrets(entry.before) : null,
    after: entry.after ? redactSecrets(entry.after) : null,
    meta: entry.meta ? redactSecrets(entry.meta) : null,
    createdAt: now,
  }
}

export async function writeSocialAudit(entry: SocialAuditEntry): Promise<void> {
  try {
    await getAdminFirestore().collection(Collections.CMS_AUDIT_LOGS).add(buildSocialAuditRecord(entry))
  } catch (err) {
    console.warn(
      `[social-audit] write failed action=${entry.action}:`,
      err instanceof Error ? err.name : 'error',
    )
  }
}
