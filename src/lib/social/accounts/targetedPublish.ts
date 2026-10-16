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
import { testModeAccountProblem, TEST_ENV_TEXT } from '../testEnvironment'
import { isWellFormedAccountId, loadSocialAccount } from './accountStore'
import { resolvePublishTarget, type ResolveTargetErrorCode } from './resolvePublishTarget'
import { formatsForMode, requiredFormats, type ComposerMode, type AutomationFormat } from './capabilities'
import { CLAIM_TEXT, claimPublish, classifyOutcome, finishPublish, UNCERTAIN_TEXT, type LedgerStatus } from './publishLedger'
import { redactSecrets, writeSocialAudit } from './audit'
import { legacyAccountId, legacyNewsFieldFor } from './legacyLock'
import type { SocialAccountPlatform } from './types'
import type { PublishTarget } from './targetTypes'
import type { SocialPublishResult } from '../types'
import { errorLogFields, socialLog } from '../safeLog'
import { metaCodeFromSafeError } from '../shareResultText'
import { markTokenRejected, TOKEN_REJECTED_CODES } from './connectionCheck'

export const TARGETABLE_PLATFORMS = ['facebook', 'instagram', 'threads', 'youtube'] as const satisfies readonly SocialAccountPlatform[]
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

/** Görev 18 EK: several accounts per platform → `{ platform: accountId[] }` (deduplicated). */
export type PublishTargetLists = Partial<Record<TargetablePlatform, string[]>>
export const MAX_TARGETS_PER_PLATFORM = 10
export const MAX_TARGETS_TOTAL = 20

export type TargetListsParse = { ok: true; lists: PublishTargetLists; total: number } | { ok: false; code: string; platform?: string }

/**
 * `{ instagram: ['instagram_1', 'instagram_2'], facebook: 'facebook_9' }` → explicit
 * account ids per platform. A single string is still accepted (old clients).
 * Duplicates (same real account — the id encodes platform + external id) are
 * dropped, so one account + format can never be published twice by one request.
 */
export function parseTargetListsInput(raw: unknown): TargetListsParse {
  if (raw === undefined || raw === null) return { ok: true, lists: {}, total: 0 }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, code: 'invalid_targets' }
  const lists: PublishTargetLists = {}
  let total = 0
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TARGETABLE_PLATFORMS as readonly string[]).includes(key)) return { ok: false, code: 'target_platform_unsupported', platform: key }
    const values = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]
    const ids: string[] = []
    for (const v of values) {
      if (v === 'legacy' || v === null || v === undefined || v === '') continue
      if (typeof v !== 'string' || !isWellFormedAccountId(v)) return { ok: false, code: 'invalid_account_id', platform: key }
      if (!v.startsWith(`${key}_`)) return { ok: false, code: 'platform_mismatch', platform: key }
      if (!ids.includes(v)) ids.push(v)
    }
    if (ids.length > MAX_TARGETS_PER_PLATFORM) return { ok: false, code: 'too_many_targets', platform: key }
    if (ids.length) {
      lists[key as TargetablePlatform] = ids
      total += ids.length
    }
  }
  if (total > MAX_TARGETS_TOTAL) return { ok: false, code: 'too_many_targets' }
  return { ok: true, lists, total }
}

/**
 * Split per-platform lists into sequential rounds of at most one account per
 * platform (round i = i-th account of each platform). Rounds run one after
 * another and platforms inside a round run sequentially, so platform requests
 * stay bounded (one at a time) — no unbounded parallel fan-out.
 */
export function targetRounds(lists: PublishTargetLists): PublishTargets[] {
  const max = Math.max(0, ...Object.values(lists).map((l) => l?.length ?? 0))
  const rounds: PublishTargets[] = []
  for (let i = 0; i < max; i++) {
    const r: PublishTargets = {}
    for (const p of TARGETABLE_PLATFORMS) {
      const id = lists[p]?.[i]
      if (id) r[p] = id
    }
    rounds.push(r)
  }
  return rounds
}

/**
 * Request time budget for sequential multi-target publishing (Görev 18).
 * The route's `maxDuration` is 300 s; a single round (FB → IG → Threads,
 * post and/or story, sequential, each with its own container polling) can
 * take tens of seconds. A NEW round is not started once this much time has
 * passed, so the last started round still has room to finish. Targets of the
 * rounds that were not started took no ledger lock and made no platform call:
 * they are reported as «süre sınırı — gönderilmedi» and may be safely
 * re-selected. Completed targets keep their ledger results.
 */
export const ROUND_START_BUDGET_MS = 150_000

export function canStartRound(roundIndex: number, startedAt: number, now: number): boolean {
  return roundIndex === 0 || now - startedAt < ROUND_START_BUDGET_MS
}

export interface NotAttemptedTarget {
  platform: TargetablePlatform
  accountId: string
  format: AutomationFormat
}

/** Targets (account × format) of the rounds from `fromRound` on — never attempted. */
export function notAttemptedTargets(rounds: PublishTargets[], fromRound: number, mode: ComposerMode): NotAttemptedTarget[] {
  const out: NotAttemptedTarget[] = []
  for (const round of rounds.slice(fromRound)) {
    for (const platform of TARGETABLE_PLATFORMS) {
      const accountId = round[platform]
      if (!accountId) continue
      for (const format of requiredFormats(platform, mode)) out.push({ platform, accountId, format })
    }
  }
  return out
}

export type PreflightResult = { ok: true } | { ok: false; platform: TargetablePlatform; code: string }

/** Validate every explicit target before any media work or publishing starts. */
export async function preflightTargets(targets: PublishTargets, mode: ComposerMode, now: number): Promise<PreflightResult> {
  for (const platform of TARGETABLE_PLATFORMS) {
    const accountId = targets[platform]
    if (!accountId) continue
    const testProblem = testModeAccountProblem(accountId)
    if (testProblem) return { ok: false, platform, code: testProblem }
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
  const supported = formatsForMode(loaded.account, mode)
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
  format: AutomationFormat
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
  // Test (preview) ortamı: yalnızca izin listesindeki hesap; ledger kaydı da açılmaz.
  const testProblem = testModeAccountProblem(input.accountId)
  if (testProblem) {
    const res: TargetedPublishResult = {
      success: false,
      accountId: input.accountId,
      code: testProblem,
      ledgerStatus: 'not_claimed',
      error: testProblem === 'test_env_misconfigured' ? TEST_ENV_TEXT.misconfigured : TEST_ENV_TEXT.targetNotAllowed,
    }
    await audit(input, res)
    return res
  }
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
  // The platform rejected THIS account's token (190 / 102) → the account waits
  // for «Platform girişiyle yeniden bağla». Never retried with another token.
  const meta = outcome.status === 'failed' ? metaCodeFromSafeError(result?.error) : null
  const tokenRejected = !!meta && TOKEN_REJECTED_CODES.has(meta.code)
  if (tokenRejected) {
    await markTokenRejected(input.accountId, { by: input.actorUid, now: now(), source: `publish:${input.platform}`, code: meta!.code, subcode: meta!.subcode }).catch((err) =>
      socialLog('error', 'publish', 'mark_reauth_error', { platform: input.platform, account: input.accountId, ...errorLogFields(err) }),
    )
  }
  const res: TargetedPublishResult = {
    success: outcome.status === 'succeeded',
    accountId: input.accountId,
    code: tokenRejected ? 'token_invalid' : outcome.code,
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
