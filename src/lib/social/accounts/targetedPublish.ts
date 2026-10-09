/**
 * Explicit-target manual publishing (composer → force-reshare → publishOneSocial).
 *
 * - The client sends ONLY `{ platform: accountId | 'legacy' }`. Names, city,
 *   host, token or external ids from the client are never used.
 * - Each targeted platform publish:
 *     claim ledger (no concurrent/duplicate post) → re-resolve the account
 *     (status / permission / expiry may have changed since preflight) →
 *     re-check format → adapter call with the resolved target → record outcome.
 * - A failed target never falls back to Onyeditivi or another account.
 * - Errors returned to the browser are short safe codes + redacted text.
 */
import 'server-only'
import { isWellFormedAccountId, loadSocialAccount } from './accountStore'
import { resolvePublishTarget, type ResolveTargetErrorCode } from './resolvePublishTarget'
import { requiredFormats, supportedFormats, type ComposerMode, type PublishFormat } from './capabilities'
import { CLAIM_TEXT, claimPublish, classifyOutcome, finishPublish, UNCERTAIN_TEXT, type LedgerStatus } from './publishLedger'
import { redactSecrets, writeSocialAudit } from './audit'
import { legacyAccountId, legacyNewsFieldFor } from './legacyLock'
import type { SocialAccountPlatform } from './types'
import type { PublishTarget } from './targetTypes'
import type { SocialPublishResult } from '../types'
import { errorLogFields, socialLog } from '../safeLog'

export const TARGETABLE_PLATFORMS = ['facebook', 'instagram', 'threads'] as const satisfies readonly SocialAccountPlatform[]
export type TargetablePlatform = (typeof TARGETABLE_PLATFORMS)[number]
export type PublishTargets = Partial<Record<TargetablePlatform, string>>

export type TargetsParse = { ok: true; targets: PublishTargets } | { ok: false; code: string; platform?: string }

/** `{ facebook: 'facebook_123' | 'legacy', … }` → explicit account ids only. */
export function parseTargetsInput(raw: unknown): TargetsParse {
  if (raw === undefined || raw === null) return { ok: true, targets: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, code: 'invalid_targets' }
  const out: PublishTargets = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TARGETABLE_PLATFORMS as readonly string[]).includes(key)) return { ok: false, code: 'target_platform_unsupported', platform: key }
    if (value === undefined || value === null || value === 'legacy') continue
    if (typeof value !== 'string' || !isWellFormedAccountId(value)) return { ok: false, code: 'invalid_account_id', platform: key }
    if (!value.startsWith(`${key}_`)) return { ok: false, code: 'platform_mismatch', platform: key }
    out[key as TargetablePlatform] = value
  }
  return { ok: true, targets: out }
}

export type PreflightResult = { ok: true } | { ok: false; platform: TargetablePlatform; code: string }

/** Validate every explicit target before any media work or publishing starts. */
export async function preflightTargets(targets: PublishTargets, mode: ComposerMode, now: number): Promise<PreflightResult> {
  for (const platform of TARGETABLE_PLATFORMS) {
    const accountId = targets[platform]
    if (!accountId) continue
    const r = await resolvePublishTarget(accountId, { expectedPlatform: platform, now })
    if (!r.ok) return { ok: false, platform, code: r.code }
    const formatErr = await formatProblem(accountId, platform, mode)
    if (formatErr) return { ok: false, platform, code: formatErr }
  }
  return { ok: true }
}

async function formatProblem(accountId: string, platform: TargetablePlatform, mode: ComposerMode): Promise<string | null> {
  const loaded = await loadSocialAccount(accountId)
  if (loaded.state !== 'ok') return 'not_found'
  const supported = supportedFormats(loaded.account)
  return requiredFormats(platform, mode).every((f) => supported.includes(f)) ? null : 'format_unsupported'
}

export { classifyOutcome, NETWORK_RE } from './publishLedger'

export interface TargetedPublishResult extends SocialPublishResult {
  accountId: string
  code: string
  ledgerStatus: LedgerStatus | 'not_claimed'
}

function safeError(text: string | undefined): string | undefined {
  if (!text) return undefined
  return String(redactSecrets(text)).slice(0, 300)
}

export async function publishToTarget(input: {
  newsId: string
  platform: TargetablePlatform
  format: PublishFormat
  mode: ComposerMode
  accountId: string
  force: boolean
  /** Exact ledger record id acknowledged by the operator (uncertain republish only). */
  acknowledgeUncertainRecordId?: string | null
  /** Attempt id of that record as shown to the operator. */
  acknowledgeUncertainAttemptId?: string | null
  actorUid: string
  trigger?: string
  publish: (target: PublishTarget) => Promise<SocialPublishResult>
  now?: () => number
}): Promise<TargetedPublishResult> {
  const now = input.now ?? Date.now
  // Same real account as the legacy Onyeditivi credentials → the same record id
  // (shared lock) and Onyeditivi's old post ids on the news doc also count.
  const legacyId = await legacyAccountId(input.platform).catch(() => null)
  const claim = await claimPublish({
    legacyNewsField: legacyId === input.accountId ? legacyNewsFieldFor(input.platform, input.format) : undefined,
    newsId: input.newsId,
    accountId: input.accountId,
    platform: input.platform,
    format: input.format,
    force: input.force,
    acknowledgeRecordId: input.acknowledgeUncertainRecordId ?? null,
    acknowledgeAttemptId: input.acknowledgeUncertainAttemptId ?? null,
    actorUid: input.actorUid,
    trigger: input.trigger ?? 'composer',
    now: now(),
  })
  if (!claim.ok) {
    const res: TargetedPublishResult = {
      success: false,
      accountId: input.accountId,
      code: claim.code,
      ledgerStatus: 'not_claimed',
      error: CLAIM_TEXT[claim.code],
      ...(claim.code === 'already_published' && claim.externalPostId ? { platformId: claim.externalPostId } : {}),
    }
    await audit(input, res)
    return res
  }

  // Re-check at publish time — status, permission, expiry and format may have changed.
  const resolved = await resolvePublishTarget(input.accountId, { expectedPlatform: input.platform, now: now() })
  const formatErr = resolved.ok ? await formatProblem(input.accountId, input.platform, input.mode) : null
  if (!resolved.ok || formatErr) {
    const code: string = !resolved.ok ? (resolved.code as ResolveTargetErrorCode) : formatErr!
    await finishPublish({ recordId: claim.recordId, attemptId: claim.attemptId, status: 'failed', externalPostId: null, errorCode: code, actorUid: input.actorUid, now: now() })
    const res: TargetedPublishResult = {
      success: false,
      accountId: input.accountId,
      code,
      ledgerStatus: 'failed',
      error: !resolved.ok ? resolved.message : 'Bu hesap bu biçimi desteklemiyor',
    }
    await audit(input, res)
    return res
  }

  let result: SocialPublishResult | null = null
  let threw = false
  try {
    result = await input.publish(resolved.target)
  } catch {
    threw = true
  }
  const outcome = classifyOutcome(result, threw)
  const externalPostId = outcome.status === 'succeeded' ? (result?.platformId ?? null) : null
  try {
    const written = await finishPublish({
      recordId: claim.recordId,
      attemptId: claim.attemptId,
      status: outcome.status,
      externalPostId,
      errorCode: outcome.status === 'succeeded' ? null : outcome.code,
      actorUid: input.actorUid,
      now: now(),
    })
    if (!written) socialLog('warn', 'publish', 'target_finish_stale', { platform: input.platform, newsId: input.newsId, account: input.accountId, status: outcome.status })
  } catch (err) {
    // The platform result stands. The record stays `publishing` and turns
    // `uncertain` when the lease expires — never re-published automatically.
    socialLog('error', 'publish', 'target_finish_error', { platform: input.platform, newsId: input.newsId, account: input.accountId, ...errorLogFields(err) })
  }
  const res: TargetedPublishResult = {
    success: outcome.status === 'succeeded',
    accountId: input.accountId,
    code: outcome.code,
    ledgerStatus: outcome.status,
    ...(externalPostId ? { platformId: externalPostId } : {}),
    ...(outcome.status === 'succeeded'
      ? {}
      : {
          error:
            outcome.status === 'uncertain'
              ? UNCERTAIN_TEXT
              : safeError(result?.error) ?? 'Platform paylaşımı reddetti',
        }),
  }
  await audit(input, res)
  return res
}


async function audit(
  input: { newsId: string; platform: string; format: string; accountId: string; actorUid: string },
  res: TargetedPublishResult,
): Promise<void> {
  await writeSocialAudit({
    actorId: input.actorUid,
    action: 'social.publish',
    entityType: 'socialAccount',
    entityId: input.accountId,
    meta: {
      newsId: input.newsId,
      platform: input.platform,
      format: input.format,
      result: res.ledgerStatus,
      code: res.code,
      externalPostId: res.platformId ?? null,
    },
  })
}
