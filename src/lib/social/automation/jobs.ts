/**
 * Automation jobs — stored in the EXISTING `smmQueue` collection (no second
 * queue). One document per (news, account, format):
 *
 *   smmQueue/auto__{newsId}__{accountId}__{format}
 *
 * The deterministic id is the dedup key: two rules matching the same
 * account+format create ONE job; repeated reconciles never duplicate it.
 * The platform-side duplicate guard is still the publish ledger
 * (`socialPublishRecords`), shared with manual and legacy paths.
 *
 * Index-free queries (single-field / equality merge only):
 *   - due jobs:   autoDueAt <= now   (field set ONLY while queued, else null)
 *   - leases:     autoLeaseUntil <= now (set ONLY while processing, else null)
 *   - per account: accountId == X AND status == queued
 *   - recent:     autoCreatedAt >= since
 */
import { randomBytes } from 'node:crypto'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { isAlreadyExists } from '../accounts/accountStore'
import type { PublishFormat } from '../accounts/capabilities'
import type { SocialAccountPlatform } from '../accounts/types'

export const AUTOMATION_JOB_KIND = 'account_automation' as const
export const JOB_LEASE_MS = 10 * 60 * 1000
export const MAX_JOB_ATTEMPTS = 3
const HISTORY_LIMIT = 10
const NEWS_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export type AutomationJobStatus = 'queued' | 'processing' | 'published' | 'failed' | 'cancelled' | 'uncertain' | 'skipped'

export interface AutomationJob {
  id: string
  kind: typeof AUTOMATION_JOB_KIND
  newsId: string
  accountId: string
  platform: SocialAccountPlatform
  format: PublishFormat
  ruleIds: string[]
  status: AutomationJobStatus
  autoDueAt: number | null
  autoLeaseUntil: number | null
  autoCreatedAt: number
  attemptId: string | null
  attempts: number
  citySlug: string | null
  newsTitle: string
  errorCode: string | null
  errorMessage: string | null
  externalPostId: string | null
  createdAt: number
  updatedAt: number
  history: Array<{ at: number; status: AutomationJobStatus; code: string | null }>
  // smmQueue compatibility fields (existing /admin/smm/queue list)
  priority: 'normal'
  scheduledAt: number | null
  payload: Record<string, unknown>
}

export function jobIdFor(newsId: string, accountId: string, format: PublishFormat): string {
  if (!NEWS_ID_RE.test(newsId)) throw new Error('invalid news id')
  return `auto__${newsId}__${accountId}__${format}`
}

function col() {
  return getAdminFirestore().collection(Collections.SMM_QUEUE)
}

function withHistory(j: AutomationJob, status: AutomationJobStatus, code: string | null, at: number) {
  return [...(j.history ?? []), { at, status, code }].slice(-HISTORY_LIMIT)
}

export async function enqueueJob(input: {
  newsId: string
  accountId: string
  platform: SocialAccountPlatform
  format: PublishFormat
  ruleIds: string[]
  citySlug: string | null
  newsTitle: string
  dueAt: number
  now: number
}): Promise<'created' | 'exists'> {
  const id = jobIdFor(input.newsId, input.accountId, input.format)
  const job: AutomationJob = {
    id,
    kind: AUTOMATION_JOB_KIND,
    newsId: input.newsId,
    accountId: input.accountId,
    platform: input.platform,
    format: input.format,
    ruleIds: input.ruleIds.slice(0, 20),
    status: 'queued',
    autoDueAt: input.dueAt,
    autoLeaseUntil: null,
    autoCreatedAt: input.now,
    attemptId: null,
    attempts: 0,
    citySlug: input.citySlug,
    newsTitle: input.newsTitle.slice(0, 160),
    errorCode: null,
    errorMessage: null,
    externalPostId: null,
    createdAt: input.now,
    updatedAt: input.now,
    history: [{ at: input.now, status: 'queued', code: 'matched' }],
    priority: 'normal',
    scheduledAt: input.dueAt,
    payload: {},
  }
  try {
    await col().doc(id).create({ ...job })
    return 'created'
  } catch (err) {
    if (isAlreadyExists(err)) return 'exists'
    throw err
  }
}

/** Which of these job ids already exist (one batched read; used before enqueueing). */
export async function existingJobIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const snaps = await getAdminFirestore().getAll(...ids.slice(i, i + 100).map((id) => col().doc(id)))
    for (const s of snaps) if (s.exists) out.add(s.id)
  }
  return out
}

/**
 * Claim up to `max` due jobs. Each claim is its own transaction: a job is
 * taken only if it is still `queued` and due, so two workers never get the
 * same job; the loser simply skips it.
 */
export async function claimDueJobs(now: number, max: number): Promise<AutomationJob[]> {
  const db = getAdminFirestore()
  const snap = await col().where('autoDueAt', '<=', now).orderBy('autoDueAt', 'asc').limit(max * 3).get()
  const claimed: AutomationJob[] = []
  for (const doc of snap.docs) {
    if (claimed.length >= max) break
    const ref = col().doc(doc.id)
    const job = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref)
      if (!s.exists) return null
      const j = s.data() as AutomationJob
      if (j.kind !== AUTOMATION_JOB_KIND || j.status !== 'queued' || j.autoDueAt === null || j.autoDueAt > now) return null
      const attemptId = randomBytes(12).toString('hex')
      const next: Partial<AutomationJob> = {
        status: 'processing',
        attemptId,
        attempts: (j.attempts ?? 0) + 1,
        autoDueAt: null,
        autoLeaseUntil: now + JOB_LEASE_MS,
        updatedAt: now,
        history: withHistory(j, 'processing', null, now),
      }
      tx.update(ref, next)
      return { ...j, ...next } as AutomationJob
    })
    if (job) claimed.push(job)
  }
  return claimed
}

export type JobOutcome =
  | { status: 'published'; externalPostId: string | null; code: string }
  | { status: 'failed' | 'cancelled' | 'uncertain' | 'skipped'; code: string; message: string | null }
  | { status: 'queued'; dueAt: number; code: string; message?: string | null; countAttempt?: boolean }

/** Write the outcome — only for the attempt that holds the job (stale workers are ignored). */
export async function finishJob(jobId: string, attemptId: string, outcome: JobOutcome, now: number): Promise<boolean> {
  const db = getAdminFirestore()
  const ref = col().doc(jobId)
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return false
    const j = s.data() as AutomationJob
    if (j.status !== 'processing' || j.attemptId !== attemptId) return false
    const patch: Partial<AutomationJob> = {
      status: outcome.status,
      autoLeaseUntil: null,
      autoDueAt: outcome.status === 'queued' ? outcome.dueAt : null,
      scheduledAt: outcome.status === 'queued' ? outcome.dueAt : j.scheduledAt,
      errorCode: outcome.status === 'published' ? null : outcome.code,
      errorMessage: outcome.status === 'published' ? null : ('message' in outcome ? outcome.message ?? null : null)?.slice(0, 300) ?? null,
      externalPostId: outcome.status === 'published' ? outcome.externalPostId : j.externalPostId,
      updatedAt: now,
      history: withHistory(j, outcome.status, outcome.code, now),
    }
    // A deferral (quiet hours / interval / another path publishing) is not an attempt.
    if (outcome.status === 'queued' && outcome.countAttempt === false) patch.attempts = Math.max(0, (j.attempts ?? 1) - 1)
    tx.update(ref, patch)
    return true
  })
}

/**
 * Jobs whose worker died mid-run (lease expired). The ledger decides:
 *   - no ledger record      → the publish call was never claimed → requeue
 *   - ledger `succeeded`    → published
 *   - anything else         → uncertain (the platform may have the post) — never auto-retried
 */
export async function recoverExpiredLeases(
  now: number,
  readLedgerStatus: (j: AutomationJob) => Promise<{ status: string; externalPostId: string | null } | null>,
  max = 20,
): Promise<number> {
  const db = getAdminFirestore()
  const snap = await col().where('autoLeaseUntil', '<=', now).limit(max).get()
  let n = 0
  for (const doc of snap.docs) {
    const j = doc.data() as AutomationJob
    if (j.kind !== AUTOMATION_JOB_KIND) continue
    const ledger = await readLedgerStatus(j).catch(() => ({ status: 'unknown', externalPostId: null }))
    const ref = col().doc(doc.id)
    const done = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref)
      const cur = s.data() as AutomationJob | undefined
      if (!cur || cur.status !== 'processing' || (cur.autoLeaseUntil ?? Infinity) > now || cur.attemptId !== j.attemptId) return false
      let patch: Partial<AutomationJob>
      if (!ledger && cur.attempts < MAX_JOB_ATTEMPTS) {
        patch = { status: 'queued', autoDueAt: now, autoLeaseUntil: null, errorCode: 'worker_restarted', history: withHistory(cur, 'queued', 'lease_expired_unclaimed', now) }
      } else if (ledger?.status === 'succeeded') {
        patch = { status: 'published', autoLeaseUntil: null, externalPostId: ledger.externalPostId, errorCode: null, history: withHistory(cur, 'published', 'lease_expired_ledger_succeeded', now) }
      } else if (!ledger) {
        patch = { status: 'failed', autoLeaseUntil: null, errorCode: 'max_attempts', history: withHistory(cur, 'failed', 'max_attempts', now) }
      } else {
        patch = {
          status: 'uncertain',
          autoLeaseUntil: null,
          errorCode: 'lease_expired',
          errorMessage: 'Çalışan yarıda kaldı; platform gönderiyi almış olabilir. Platformda kontrol edin — otomatik tekrar yok.',
          history: withHistory(cur, 'uncertain', 'lease_expired', now),
        }
      }
      tx.update(ref, { ...patch, updatedAt: now })
      return true
    })
    if (done) n++
  }
  return n
}

/**
 * Cancel queued (not yet sent) jobs of an account. `keep` lets the caller
 * spare jobs still covered by another enabled rule. Already-published posts
 * are NOT touched — deleting a platform post is a separate, explicit action.
 */
export async function cancelQueuedForAccount(
  accountId: string,
  code: string,
  now: number,
  keep: (j: AutomationJob) => boolean = () => false,
): Promise<number> {
  const db = getAdminFirestore()
  const snap = await col().where('accountId', '==', accountId).where('status', '==', 'queued').limit(200).get()
  let n = 0
  for (const doc of snap.docs) {
    const j = doc.data() as AutomationJob
    if (j.kind !== AUTOMATION_JOB_KIND || keep(j)) continue
    const ref = col().doc(doc.id)
    const ok = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref)
      const cur = s.data() as AutomationJob | undefined
      if (!cur || cur.status !== 'queued') return false
      tx.update(ref, { status: 'cancelled', autoDueAt: null, errorCode: code, updatedAt: now, history: withHistory(cur, 'cancelled', code, now) })
      return true
    })
    if (ok) n++
  }
  return n
}

export interface AutomationJobPublic {
  id: string
  newsId: string
  newsTitle: string
  accountId: string
  platform: SocialAccountPlatform
  format: PublishFormat
  ruleIds: string[]
  status: AutomationJobStatus
  dueAt: number | null
  attempts: number
  errorCode: string | null
  errorMessage: string | null
  externalPostId: string | null
  createdAt: number
  updatedAt: number
}

export function toPublicJob(j: AutomationJob): AutomationJobPublic {
  return {
    id: j.id,
    newsId: j.newsId,
    newsTitle: j.newsTitle,
    accountId: j.accountId,
    platform: j.platform,
    format: j.format,
    ruleIds: j.ruleIds ?? [],
    status: j.status,
    dueAt: j.autoDueAt ?? null,
    attempts: j.attempts ?? 0,
    errorCode: j.errorCode ?? null,
    errorMessage: j.errorMessage ?? null,
    externalPostId: j.externalPostId ?? null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  }
}

/** Recent automation jobs (single-field range on autoCreatedAt; bounded). */
export async function listRecentJobs(input: { since: number; limit: number; accountIds?: Set<string> | null }): Promise<AutomationJobPublic[]> {
  const snap = await col().where('autoCreatedAt', '>=', input.since).orderBy('autoCreatedAt', 'desc').limit(Math.min(input.limit, 300)).get()
  return snap.docs
    .map((d) => d.data() as AutomationJob)
    .filter((j) => j.kind === AUTOMATION_JOB_KIND && (!input.accountIds || input.accountIds.has(j.accountId)))
    .map(toPublicJob)
}
