/**
 * Automation worker — one shared tick for every account (no per-province cron).
 *
 *   1. recover jobs whose worker died (ledger decides: requeue / published / uncertain)
 *   2. reconcile: newly published news → jobs (only when a rule is enabled)
 *   3. claim ≤ MAX_JOBS due jobs (transactional) and process each:
 *        pre-send recheck (news still published + own content, a rule still
 *        enabled AND matching, account publishable for that format, not stale)
 *        → quiet hours / interval / daily cap (transactional counter)
 *        → publishOneSocial(… one explicit target, automation) → ledger lock
 *        → map the result; uncertain is NEVER retried automatically.
 *
 * Idle cost: one rules query + two tiny job queries per tick.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { isSocialTestMode } from '../testEnvironment'
import { safeErrorText, socialLog } from '../safeLog'
import { socialEligibility } from '../eligibility'
import { loadSocialAccount, setSocialAccountStatus } from '../accounts/accountStore'
import { targetBlocker, TARGET_BLOCKER_TEXT } from '../accounts/capabilities'
import { readLedger } from '../accounts/publishLedger'
import { toPublicSocialAccount } from '../accounts/types'
import { redactSecrets, writeSocialAudit } from '../accounts/audit'
import { metaCodeFromSafeError } from '../shareResultText'
import type { SocialPublishResult } from '../types'
import type { PublishOneSocialOptions, PublishOneSocialResult } from '../publishOneSocial'
import { cancelQueuedForAccount, claimDueJobs, finishJob, MAX_JOB_ATTEMPTS, recoverExpiredLeases, type AutomationJob, type JobOutcome } from './jobs'
import { quietDeferral, releaseSlot, reserveSlot, strictestLimits } from './limits'
import { evaluateRule, newsFactsFrom } from './match'
import { reconcile, type ReconcileReport } from './reconcile'
import { listRules } from './ruleStore'
import type { AutomationRule } from './types'

export const MAX_JOBS_PER_TICK = 3
export const TICK_BUDGET_MS = 200_000
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000
const IN_PROGRESS_RETRY_MS = 5 * 60 * 1000
const RATE_LIMIT_BACKOFF_MS = 15 * 60 * 1000

/** Meta rate-limit / throttling codes (application, user, page, custom limits). */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002])
/** Access token invalid / expired / revoked. */
const TOKEN_CODES = new Set([190, 102])

type Publisher = (newsId: string, options: PublishOneSocialOptions) => Promise<PublishOneSocialResult>

export interface WorkerDeps {
  now?: () => number
  publish?: Publisher
}

/**
 * Content-level reason a news item is not auto-published (null = eligible).
 * Delegates to the explicit eligibility model (eligibility.ts): own content,
 * or an editor's «sosyal yayına uygun» decision with a media-rights basis.
 */
export function automationContentProblemWith(
  d: Record<string, unknown>,
  m: Pick<typeof import('../publishOneSocial'), 'isOwnContent' | 'isSkippableForSocial' | 'extractImageUrl'>,
): string | null {
  const v = socialEligibility(d, m)
  return v.ok ? null : v.code
}

export const CONTENT_PROBLEM_TEXT: Record<string, string> = {
  video_not_supported: 'Video haber — otomatik video/Reels paylaşımı yok',
  needs_social_review: 'Harici kaynak: sosyal yayın ve görsel kullanım onayı yok — editör onayı gerekli',
  social_blocked: 'Editör sosyal yayını kapattı',
  rights_blocked: 'Hak kararı: yayınlanmamalı / yeniden yazılmalı',
  not_suitable: 'Canlı yayın / tanıtım / boş içerik',
  no_image: 'Kapak görseli yok',
}

export interface TickReport {
  skipped?: string
  recovered: number
  reconcile: ReconcileReport | null
  tokens?: { refreshed: number; failed: number; expired: number; skipped: number }
  processed: Array<{ jobId: string; status: string; code: string }>
  durationMs: number
}

export async function runAutomationTick(deps: WorkerDeps = {}): Promise<TickReport> {
  const now = deps.now ?? Date.now
  const started = now()
  const report: TickReport = { recovered: 0, reconcile: null, processed: [], durationMs: 0 }
  if (isSocialTestMode()) {
    report.skipped = 'test_mode'
    return report
  }
  const publishMod = await import('../publishOneSocial')
  const publish: Publisher = deps.publish ?? publishMod.publishOneSocial
  const contentProblem = (d: Record<string, unknown>) => automationContentProblemWith(d, publishMod)

  report.recovered = await recoverExpiredLeases(started, async (j) => {
    const rec = await readLedger(j.newsId, j.accountId, j.format)
    return rec ? { status: rec.status, externalPostId: rec.externalPostId } : null
  })

  // Token renewal runs on EVERY tick — before (and independent of) rules, so
  // it is never skipped when no automation rule is enabled.
  let tokenError: string | null = null
  try {
    const { refreshDueTokens } = await import('../accounts/tokenRefresh')
    report.tokens = await refreshDueTokens(started)
  } catch (err) {
    tokenError = safeErrorText(err).slice(0, 120)
    socialLog('error', 'cron', 'token_refresh_error', { error: safeErrorText(err).slice(0, 200) })
  }
  const tokenCheckedAt = now()

  const rules = await listRules({ enabledOnly: true })
  try {
    report.reconcile = await reconcile({ now: started, rules, contentProblem })
  } catch (err) {
    socialLog('error', 'cron', 'reconcile_error', { error: safeErrorText(err).slice(0, 200) })
  }

  const jobs = await claimDueJobs(now(), MAX_JOBS_PER_TICK)
  for (const job of jobs) {
    if (now() - started > TICK_BUDGET_MS) {
      // Out of time: hand the claimed job back untouched (not an attempt).
      await finishJob(job.id, job.attemptId!, { status: 'queued', dueAt: now(), code: 'tick_budget', countAttempt: false }, now())
      report.processed.push({ jobId: job.id, status: 'queued', code: 'tick_budget' })
      continue
    }
    const outcome = await runClaimedJob(job, rules, publish, contentProblem, now)
    report.processed.push({ jobId: job.id, status: outcome.status, code: outcome.code })
  }
  report.durationMs = now() - started
  await writeWorkerHeartbeat({
    lastRunAt: started,
    durationMs: report.durationMs,
    enabledRules: rules.length,
    reconcileRan: report.reconcile?.ran === true,
    jobsProcessed: report.processed.length,
    recovered: report.recovered,
    tokenCheckedAt: tokenError ? null : tokenCheckedAt,
    tokenError,
    tokens: report.tokens ?? null,
  })
  return report
}

/**
 * Low-cost observability: ONE small document write per tick
 * (`socialAutomationState/workerHeartbeat`, ~288 writes/day, no reads).
 * Contains counts and timestamps only — never token values or account data.
 */
export async function writeWorkerHeartbeat(h: Record<string, unknown>): Promise<void> {
  try {
    await getAdminFirestore().collection(Collections.SOCIAL_AUTOMATION_STATE).doc('workerHeartbeat').set(h)
  } catch (err) {
    socialLog('error', 'cron', 'heartbeat_error', { error: safeErrorText(err).slice(0, 120) })
  }
}

/** Process one claimed job and record the outcome (exceptions → uncertain, never retried). */
export async function runClaimedJob(
  job: AutomationJob,
  rules: AutomationRule[],
  publish: Publisher,
  contentProblem: (d: Record<string, unknown>) => string | null,
  now: () => number,
): Promise<JobOutcome> {
  let outcome: JobOutcome
  try {
    outcome = await processJob(job, rules, publish, contentProblem, now)
  } catch (err) {
    // An exception may have happened after the platform call → uncertain, never retried.
    socialLog('error', 'cron', 'job_error', { job: job.id, error: safeErrorText(err).slice(0, 200) })
    outcome = { status: 'uncertain', code: 'exception', message: 'Beklenmeyen hata — platformda kontrol edin; otomatik tekrar yok.' }
  }
  await finishJob(job.id, job.attemptId!, outcome, now())
  socialLog('log', 'cron', 'automation_job', { job: job.id, account: job.accountId, format: job.format, status: outcome.status, code: outcome.code })
  return outcome
}

function resultFor(job: AutomationJob, r: PublishOneSocialResult): SocialPublishResult | null {
  const set = job.format === 'post' ? r.post : job.format === 'reel' ? r.reel : r.story
  if (!set) return null
  return ((set as unknown as Record<string, SocialPublishResult | undefined>)[job.platform]) ?? null
}

export async function processJob(
  job: AutomationJob,
  enabledRules: AutomationRule[],
  publish: Publisher,
  contentProblem: (d: Record<string, unknown>) => string | null,
  now: () => number,
): Promise<JobOutcome> {
  const t = now()
  // ── News still publishable? (removed / unpublished → cancel) ──
  const snap = await getAdminFirestore().collection(Collections.NEWS).doc(job.newsId).get()
  if (!snap.exists) return { status: 'cancelled', code: 'news_removed', message: 'Haber silinmiş' }
  const data = snap.data() as Record<string, unknown>
  const facts = newsFactsFrom(job.newsId, data)
  if (job.eligibleAt != null) facts.eligibleAt = Math.max(job.eligibleAt, facts.publishedAt ?? 0)
  if (facts.status !== 'published') return { status: 'cancelled', code: 'news_unpublished', message: 'Haber artık yayında değil' }
  // İleri tarihli haber: yayın saati gelene kadar bekler (deneme sayılmaz).
  if (facts.publishedAt !== null && facts.publishedAt > t) {
    return { status: 'queued', dueAt: facts.publishedAt, code: 'not_live', countAttempt: false }
  }
  const problem = contentProblem(data)
  if (problem) return { status: 'skipped', code: problem, message: CONTENT_PROBLEM_TEXT[problem] ?? problem }

  // ── A rule still enabled for this account+format AND matching right now ──
  const matching = enabledRules.filter((r) => r.accountId === job.accountId && r.formats.includes(job.format) && evaluateRule(r, facts).match)
  if (matching.length === 0) return { status: 'cancelled', code: 'no_matching_rule', message: 'Eşleşen açık kural kalmadı' }

  // ── Account publishable for this format ──
  const loaded = await loadSocialAccount(job.accountId)
  if (loaded.state !== 'ok') return { status: 'cancelled', code: 'account_missing', message: 'Hesap kaydı yok' }
  const blocker = targetBlocker(toPublicSocialAccount(loaded.account), job.format, t)
  if (blocker) {
    const cancel = blocker === 'status_paused' || blocker === 'status_disabled'
    return { status: cancel ? 'cancelled' : 'failed', code: blocker, message: `Hesap: ${TARGET_BLOCKER_TEXT[blocker]}` }
  }

  // ── Freshness, quiet hours, interval, daily cap ──
  const liveAt = facts.eligibleAt ?? facts.publishedAt
  if (liveAt !== null && t - liveAt > STALE_AFTER_MS) {
    return { status: 'skipped', code: 'stale', message: 'Haber 12 saatten eski — otomatik paylaşılmadı' }
  }
  const limits = strictestLimits(matching)
  const quietUntil = quietDeferral(t, limits.quietHours)
  if (quietUntil !== null) {
    if (liveAt !== null && quietUntil - liveAt > STALE_AFTER_MS) {
      return { status: 'skipped', code: 'stale', message: 'Sessiz saatler bitene kadar haber eskiyecek' }
    }
    return { status: 'queued', dueAt: quietUntil, code: 'quiet_hours', countAttempt: false }
  }
  const slot = await reserveSlot(job.accountId, limits, t)
  if (!slot.ok) {
    if (slot.reason === 'daily_limit') return { status: 'skipped', code: 'daily_limit', message: `Günlük sınır (${limits.dailyLimit}) doldu` }
    if (liveAt !== null && slot.retryAt - liveAt > STALE_AFTER_MS) {
      return { status: 'skipped', code: 'stale', message: 'Paylaşım aralığı nedeniyle haber eskiyecek' }
    }
    return { status: 'queued', dueAt: slot.retryAt, code: 'min_interval', countAttempt: false }
  }

  // ── Publish through the shared ledger lock (one explicit target, no legacy fallback) ──
  const { AUTOMATION_ACTOR_UID } = await import('../publishOneSocial')
  const result = await publish(job.newsId, {
    mode: job.format,
    targets: { [job.platform]: job.accountId },
    // Tek görselli gönderi (kaydırmalı otomasyonda yok); AI yeniden yazımı publishOneSocial'da kapalı.
    overrides: { platforms: { facebook: job.platform === 'facebook', instagram: job.platform === 'instagram', threads: job.platform === 'threads', twitter: false }, imageMode: 'single' },
    actorUid: AUTOMATION_ACTOR_UID,
    automation: { jobId: job.id, attemptId: job.attemptId! },
    trigger: 'automation',
  })
  const outcome = mapPublishResult(job, result, now())
  const sent = outcome.status === 'published' && outcome.code === 'published'
  if (!sent && outcome.status !== 'uncertain') {
    await releaseSlot(slot.reservation, now()).catch(() => undefined)
  }
  if (outcome.status === 'failed' && outcome.code === 'token_invalid') {
    // Yetki iptali / süresi dolmuş anahtar → hesap yeniden bağlantı bekler, kuyruğu durur.
    await setSocialAccountStatus(job.accountId, 'needs_reauth', { reason: 'Platform erişim anahtarını reddetti — yeniden bağlayın', updatedBy: AUTOMATION_ACTOR_UID, now: now() }).catch(() => undefined)
    await cancelQueuedForAccount(job.accountId, 'needs_reauth', now()).catch(() => 0)
  }
  await writeSocialAudit({
    actorId: AUTOMATION_ACTOR_UID,
    actorType: 'SYSTEM',
    action: 'social.automation.publish',
    entityType: 'socialAutomationJob',
    entityId: job.id,
    meta: { newsId: job.newsId, accountId: job.accountId, format: job.format, ruleIds: matching.map((r) => r.id), status: outcome.status, code: outcome.code },
  })
  return outcome
}

export function mapPublishResult(job: AutomationJob, r: PublishOneSocialResult, at: number): JobOutcome {
  if (r.skipped) return { status: 'skipped', code: 'publish_skipped', message: String(redactSecrets(r.reason ?? 'Paylaşım atlandı')).slice(0, 300) }
  const res = resultFor(job, r)
  if (!res) return { status: 'uncertain', code: 'no_result', message: 'Platform sonucu alınamadı — platformda kontrol edin; otomatik tekrar yok.' }
  if (res.success) return { status: 'published', externalPostId: res.platformId ?? null, code: 'published' }
  const code = res.code ?? ''
  const msg = res.error ? String(redactSecrets(res.error)).slice(0, 300) : null
  if (code === 'already_published') return { status: 'published', externalPostId: res.platformId ?? null, code: 'already_published' }
  if (code === 'in_progress') return { status: 'queued', dueAt: at + IN_PROGRESS_RETRY_MS, code: 'in_progress', countAttempt: false }
  if (code === 'uncertain_previous_attempt' || res.ledgerStatus === 'uncertain') return { status: 'uncertain', code: code || 'uncertain', message: msg }
  const meta = metaCodeFromSafeError(res.error ?? '')
  if (meta && TOKEN_CODES.has(meta.code)) return { status: 'failed', code: 'token_invalid', message: msg }
  const rateLimited = (meta && RATE_LIMIT_CODES.has(meta.code)) || /HTTP 429/.test(res.error ?? '')
  if (rateLimited) {
    return job.attempts < MAX_JOB_ATTEMPTS
      ? { status: 'queued', dueAt: at + RATE_LIMIT_BACKOFF_MS * Math.max(1, job.attempts), code: 'rate_limited', message: msg }
      : { status: 'failed', code: 'rate_limited', message: msg }
  }
  return { status: 'failed', code: code || 'failed', message: msg }
}

export interface WorkerHeartbeat {
  lastRunAt: number | null
  durationMs: number | null
  enabledRules: number | null
  reconcileRan: boolean
  jobsProcessed: number | null
  tokenCheckedAt: number | null
  tokenError: string | null
  tokens: { refreshed: number; failed: number; expired: number; skipped: number; expiredFound?: number; dueFound?: number } | null
}

/** One read for the automation panel (null = the worker has never written a heartbeat). */
export async function readWorkerHeartbeat(): Promise<WorkerHeartbeat | null> {
  try {
    const s = await getAdminFirestore().collection(Collections.SOCIAL_AUTOMATION_STATE).doc('workerHeartbeat').get()
    if (!s.exists) return null
    const d = s.data() as Record<string, unknown>
    const num = (v: unknown) => (typeof v === 'number' ? v : null)
    return {
      lastRunAt: num(d.lastRunAt),
      durationMs: num(d.durationMs),
      enabledRules: num(d.enabledRules),
      reconcileRan: d.reconcileRan === true,
      jobsProcessed: num(d.jobsProcessed),
      tokenCheckedAt: num(d.tokenCheckedAt),
      tokenError: typeof d.tokenError === 'string' ? d.tokenError : null,
      tokens: d.tokens && typeof d.tokens === 'object' ? (d.tokens as WorkerHeartbeat['tokens']) : null,
    }
  } catch {
    return null
  }
}
