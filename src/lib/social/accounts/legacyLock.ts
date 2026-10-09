/**
 * Shared publish lock for the legacy (target-less) Onyeditivi path.
 *
 * Every legacy trigger (composer → publishOneSocial, CMS `after()`, cron,
 * force-reshare bulk, test routes) reaches the platform through the adapters'
 * target-less branch, so the lock lives there — one choke point instead of one
 * per caller. It reuses `socialPublishRecords` (no second ledger):
 *
 *   record id = `${newsId}__${platform}_${externalId}__${format}`
 *
 * where externalId comes from the SAME legacy credentials the adapter is about
 * to use. An explicit target to the same real account resolves to the same
 * account id → the same record → one lock for both call paths.
 *
 * - live lease            → `in_progress`, regardless of `force`
 * - `succeeded` / old post id on the news doc → `already_published` unless `force`
 * - `uncertain` / expired lease → blocked; only an exact-record acknowledgement
 *   (operator republish) passes, never a general flag
 * - missing legacy configuration → the adapter runs unchanged and returns its
 *   existing "credentials eksik" error (no id is invented)
 */
import 'server-only'
import { isSocialTestMode, TEST_ENV_TEXT } from '../testEnvironment'
import { resolveLegacyCredentials } from './resolvePublishTarget'
import { accountIdFor, isValidExternalId, type SocialAccountPlatform } from './types'
import type { PublishFormat } from './capabilities'
import { CLAIM_TEXT, claimPublish, classifyOutcome, finishPublish, UNCERTAIN_TEXT } from './publishLedger'
import type { SocialPublishResult } from '../types'
import { errorLogFields, socialLog } from '../safeLog'

export interface LegacyPublishOptions {
  /** Re-publish over a succeeded record / old post id. Never bypasses a live lock or an uncertain record. */
  force?: boolean
  /** Exact ledger record id acknowledged by an operator (uncertain republish only). */
  acknowledgeUncertainRecordId?: string | null
  /** Attempt id of that record as shown to the operator (stale acknowledgements are ignored). */
  acknowledgeUncertainAttemptId?: string | null
  actorUid?: string
  /** composer | after | cron | force_reshare | test … (diagnostics only) */
  trigger?: string
}

/** `code` / `ledgerStatus` / `ledgerRecordId` live on SocialPublishResult. */
export type LockedPublishResult = SocialPublishResult

const LEGACY_NEWS_FIELD: Record<SocialAccountPlatform, Partial<Record<PublishFormat, string>>> = {
  facebook: { post: 'facebookPostId', story: 'facebookStoryId' },
  instagram: { post: 'instagramMediaId', story: 'instagramStoryId' },
  threads: { post: 'threadsPostId' },
}

/**
 * Haber belgesine yazılabilir sonuç: gerçek başarı ya da ledger'ın doğrulanmış
 * dış kimlikle "zaten yayımlandı" demesi (yeniden yayın yapılmadan).
 */
export function isVerifiedPublish(r: SocialPublishResult | null | undefined): boolean {
  if (!r) return false
  if (r.success) return true
  return r.code === 'already_published' && typeof r.platformId === 'string' && r.platformId.trim().length > 0
}

export function legacyNewsFieldFor(platform: SocialAccountPlatform, format: PublishFormat): string | undefined {
  return LEGACY_NEWS_FIELD[platform]?.[format]
}

/** Account id of the legacy Onyeditivi credentials, or null when not configured. */
export async function legacyAccountId(platform: SocialAccountPlatform): Promise<string | null> {
  const legacy = await resolveLegacyCredentials(platform).catch(() => null)
  if (!legacy || !isValidExternalId(legacy.externalId)) return null
  return accountIdFor(platform, legacy.externalId)
}

export async function withLegacyPublishLock(
  input: { platform: SocialAccountPlatform; format: PublishFormat; newsId: string; options?: LegacyPublishOptions },
  run: () => Promise<SocialPublishResult>,
  now: () => number = Date.now,
): Promise<LockedPublishResult> {
  const opts = input.options ?? {}
  if (isSocialTestMode()) {
    // Test ortamı: hedefsiz (legacy) yayın hiç çalışmaz — kimlik bilgisi de okunmaz.
    socialLog('warn', 'publish', 'legacy_blocked', { platform: input.platform, newsId: input.newsId, code: 'test_env_legacy_disabled' })
    return { success: false, error: TEST_ENV_TEXT.legacyDisabled, code: 'test_env_legacy_disabled', ledgerStatus: 'not_claimed' }
  }
  const accountId = await legacyAccountId(input.platform)
  if (!accountId) {
    // Not configured → adapter returns its existing safe "credentials eksik" error.
    return run()
  }
  const actorUid = opts.actorUid || 'system:legacy'

  let claim: Awaited<ReturnType<typeof claimPublish>>
  try {
    claim = await claimPublish({
      newsId: input.newsId,
      accountId,
      platform: input.platform,
      format: input.format,
      force: opts.force === true,
      acknowledgeRecordId: opts.acknowledgeUncertainRecordId ?? null,
      acknowledgeAttemptId: opts.acknowledgeUncertainAttemptId ?? null,
      legacyNewsField: legacyNewsFieldFor(input.platform, input.format),
      actorUid,
      trigger: opts.trigger ?? 'legacy',
      now: now(),
    })
  } catch (err) {
    // Fail closed: without the lock we cannot rule out a concurrent publish.
    socialLog('error', 'publish', 'legacy_lock_error', { platform: input.platform, format: input.format, newsId: input.newsId, ...errorLogFields(err) })
    return { success: false, error: 'Yayın kilidi alınamadı — paylaşım yapılmadı, daha sonra tekrar deneyin', code: 'lock_unavailable', ledgerStatus: 'not_claimed' }
  }
  if (!claim.ok) {
    socialLog('log', 'publish', 'legacy_blocked', { platform: input.platform, format: input.format, newsId: input.newsId, account: accountId, code: claim.code })
    return {
      success: false,
      error: CLAIM_TEXT[claim.code],
      code: claim.code,
      ledgerStatus: 'not_claimed',
      // Doğrulanmış önceki dış kimlik — çağıran yalnızca eksik legacy alanı
      // uzlaştırmak için kullanır; yeniden yayın yapılmaz.
      ...(claim.code === 'already_published' && claim.externalPostId ? { platformId: claim.externalPostId } : {}),
    }
  }

  let result: SocialPublishResult | null = null
  let threw = false
  try {
    result = await run()
  } catch (err) {
    threw = true
    socialLog('error', 'publish', 'legacy_adapter_threw', { platform: input.platform, newsId: input.newsId, ...errorLogFields(err) })
  }
  const outcome = classifyOutcome(result, threw)
  try {
    const written = await finishPublish({
      recordId: claim.recordId,
      attemptId: claim.attemptId,
      status: outcome.status,
      externalPostId: outcome.status === 'succeeded' ? (result?.platformId ?? null) : null,
      errorCode: outcome.status === 'succeeded' ? null : outcome.code,
      actorUid,
      now: now(),
    })
    if (!written) socialLog('warn', 'publish', 'legacy_finish_stale', { platform: input.platform, newsId: input.newsId, status: outcome.status })
  } catch (err) {
    // The platform result stands; the record stays `publishing` and turns
    // `uncertain` when its lease expires (never auto-retried).
    socialLog('error', 'publish', 'legacy_finish_error', { platform: input.platform, newsId: input.newsId, ...errorLogFields(err) })
  }
  const base = { code: outcome.code, ledgerStatus: outcome.status, ledgerRecordId: claim.recordId }
  if (!result) return { success: false, error: UNCERTAIN_TEXT, ...base }
  if (outcome.status === 'uncertain' && !result.success) return { ...result, error: UNCERTAIN_TEXT, ...base }
  return { ...result, ...base }
}
