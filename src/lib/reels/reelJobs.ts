import 'server-only'

/**
 * REELS-12 — background reel jobs.
 *
 * www.nahaber.com sits behind Cloudflare, which closes any request after 100 s (HTTP 524)
 * even though the Vercel function may run 800 s. A reel from a story's own video takes
 * longer than that, so the studio and the share flow now START the work, get a job id at
 * once, and poll it. The work runs in `after()` inside the same function (maxDuration 800).
 *
 * Firestore `reelJobs/{jobId}` (Admin SDK only):
 *   { kind, newsId, by, status: 'running'|'done'|'failed', startedAt, finishedAt,
 *     resultJson, error, httpStatus }
 * Deterministic ids (build_{newsId}, share_{newsId}_{account}_{format}) let a second click
 * join the job already running instead of starting the same work twice.
 *
 * FinOps (25 Nov 2026) — remote runner. A job started with `remote: { handler, args }`
 * (reelJobHandlers.ts) is QUEUED instead of run here when the Neon owner flag
 * `reel_jobs_owner` = 'railway'; the Railway reel worker claims and runs it. Safety nets,
 * so nothing waits forever if Railway is down:
 *   - the studio's poll (readReelJob) runs a job itself when it is still queued after 45 s
 *   - /api/cron/reel-jobs-sweep runs queued jobs nobody polls (automation) after 2 min
 * With the flag on 'vercel' (default) nothing changes. Railway runs heartbeat every 30 s;
 * one without a heartbeat for 3 min counts as dead.
 */
import { randomBytes } from 'node:crypto'
import { after } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const REEL_JOBS_COLLECTION = 'reelJobs'
/** A running job older than this is considered dead (function limit 800 s + margin). */
export const REEL_JOB_STALE_MS = 14 * 60 * 1000
/** A Railway-run job without a heartbeat for this long is considered dead. */
export const REEL_JOB_HEARTBEAT_STALE_MS = 3 * 60 * 1000
export const REEL_JOB_HEARTBEAT_MS = 30 * 1000
/** A queued job the poller sees after this long is run by Vercel itself. */
export const REEL_JOB_QUEUED_FALLBACK_MS = 45 * 1000
/** A queued job nobody polls is run by the Vercel sweep cron after this long. */
export const REEL_JOB_SWEEP_AFTER_MS = 2 * 60 * 1000

export type ReelJobKind = 'build' | 'render' | 'share'
export type ReelJobRunner = 'vercel' | 'railway' | 'vercel-fallback'
export type ReelJobDoc = {
  kind: ReelJobKind
  newsId: string
  by: string
  status: 'queued' | 'running' | 'done' | 'failed'
  startedAt: number
  finishedAt: number | null
  resultJson: string | null
  error: string | null
  httpStatus: number | null
  /** remote runner (FinOps 25 Nov) */
  handler?: string | null
  argsJson?: string | null
  queuedAt?: number | null
  runner?: ReelJobRunner | null
  heartbeatAt?: number | null
}
export type ReelJobView = {
  jobId: string
  status: 'running' | 'done' | 'failed'
  result: unknown
  error: string | null
  httpStatus: number | null
  startedAt: number
  finishedAt: number | null
}
export type ReelJobRemote = { handler: string; args: Record<string, unknown> }

const JOB_ID = /^[A-Za-z0-9_-]{6,200}$/
export const isReelJobId = (v: unknown): v is string => typeof v === 'string' && JOB_ID.test(v)

export function reelJobId(parts: string[] | null): string {
  if (!parts) return `job_${randomBytes(9).toString('hex')}`
  return parts.map((p) => p.replace(/[^A-Za-z0-9-]/g, '-')).join('_').slice(0, 200)
}

function view(jobId: string, d: ReelJobDoc): ReelJobView {
  let result: unknown = null
  try {
    result = d.resultJson ? JSON.parse(d.resultJson) : null
  } catch {
    result = null
  }
  // A queued job looks like a running one to the studio (same polling, same spinner).
  const status = d.status === 'queued' ? 'running' : d.status
  return { jobId, status, result, error: d.error, httpStatus: d.httpStatus, startedAt: d.startedAt, finishedAt: d.finishedAt }
}

/** Is a running job dead? Railway jobs by heartbeat, Vercel ones by the function limit. */
export function isRunningJobStale(d: Pick<ReelJobDoc, 'status' | 'startedAt' | 'runner' | 'heartbeatAt'>, now: number): boolean {
  if (d.status !== 'running') return false
  if (d.runner === 'railway') return now - Math.max(d.startedAt, d.heartbeatAt ?? 0) > REEL_JOB_HEARTBEAT_STALE_MS
  return now - d.startedAt > REEL_JOB_STALE_MS
}

/** A queued job that waited this long is not joined any more (it gets re-queued / restarted). */
function isQueuedJobAbandoned(d: Pick<ReelJobDoc, 'status' | 'queuedAt' | 'startedAt'>, now: number): boolean {
  return d.status === 'queued' && now - (d.queuedAt ?? d.startedAt) > REEL_JOB_STALE_MS
}

type RunFn = () => Promise<{ result: unknown; httpStatus?: number }>

/** Write the outcome of a run, the same shape for every runner. */
export async function settleReelJob(jobId: string, run: RunFn): Promise<void> {
  const ref = getAdminFirestore().collection(REEL_JOBS_COLLECTION).doc(jobId)
  try {
    const out = await run()
    await ref.set(
      {
        status: 'done',
        finishedAt: Date.now(),
        resultJson: JSON.stringify(out.result ?? null).slice(0, 900_000),
        httpStatus: out.httpStatus ?? 200,
      },
      { merge: true },
    )
  } catch (err) {
    await ref
      .set(
        {
          status: 'failed',
          finishedAt: Date.now(),
          error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
          httpStatus: err instanceof Error && err.name === 'TtsQuotaError' ? 429 : 500,
        },
        { merge: true },
      )
      .catch(() => undefined)
  }
}

/**
 * Start (or join) a job. `run` returns `{ result, httpStatus }`; a thrown error marks the
 * job failed. Returns immediately; the work continues after the response is sent.
 * With `remote` and the owner flag on 'railway' the job is queued for the reel worker.
 */
export async function startReelJob(input: {
  jobId: string
  kind: ReelJobKind
  newsId: string
  by: string
  run: RunFn
  remote?: ReelJobRemote
}): Promise<ReelJobView> {
  const ref = getAdminFirestore().collection(REEL_JOBS_COLLECTION).doc(input.jobId)
  const now = Date.now()
  let queue = false
  if (input.remote) {
    const { readReelJobsOwner } = await import('./reelJobOwner')
    queue = (await readReelJobsOwner(now)) === 'railway'
  }
  const joined = await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const cur = snap.exists ? (snap.data() as ReelJobDoc) : null
    if (cur && cur.status === 'running' && !isRunningJobStale(cur, now)) return cur
    if (cur && cur.status === 'queued' && !isQueuedJobAbandoned(cur, now)) return cur
    const doc: ReelJobDoc = {
      kind: input.kind,
      newsId: input.newsId,
      by: input.by,
      status: queue ? 'queued' : 'running',
      startedAt: now,
      finishedAt: null,
      resultJson: null,
      error: null,
      httpStatus: null,
      handler: queue && input.remote ? input.remote.handler : null,
      argsJson: queue && input.remote ? JSON.stringify(input.remote.args) : null,
      queuedAt: queue ? now : null,
      runner: queue ? null : 'vercel',
      heartbeatAt: null,
    }
    tx.set(ref, doc)
    return null
  })
  if (joined) return view(input.jobId, joined)
  if (!queue) after(() => settleReelJob(input.jobId, input.run))
  return { jobId: input.jobId, status: 'running', result: null, error: null, httpStatus: null, startedAt: now, finishedAt: null }
}

/**
 * Claim a queued job for one runner (transaction: queued → running). Returns what to run,
 * or null when another runner took it first or it is not queued any more.
 */
export async function claimQueuedReelJob(
  jobId: string,
  runner: ReelJobRunner,
  now = Date.now(),
): Promise<{ handler: string; args: Record<string, unknown>; by: string } | null> {
  const ref = getAdminFirestore().collection(REEL_JOBS_COLLECTION).doc(jobId)
  return getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return null
    const d = snap.data() as ReelJobDoc
    if (d.status !== 'queued' || !d.handler) return null
    let args: Record<string, unknown> = {}
    try {
      args = d.argsJson ? (JSON.parse(d.argsJson) as Record<string, unknown>) : {}
    } catch {
      args = {}
    }
    tx.update(ref, { status: 'running', runner, startedAt: now, heartbeatAt: now })
    return { handler: d.handler, args, by: d.by }
  })
}

/** Run a claimed job through the handler registry and record the outcome. */
export async function runClaimedReelJob(jobId: string, claim: { handler: string; args: Record<string, unknown> }): Promise<void> {
  const { isReelJobHandlerName, runReelJobHandler } = await import('./reelJobHandlers')
  await settleReelJob(jobId, async () => {
    if (!isReelJobHandlerName(claim.handler)) throw new Error(`Bilinmeyen iş türü: ${claim.handler}`)
    return runReelJobHandler(claim.handler, claim.args)
  })
}

/** Vercel safety net: claim + run a queued job in this function (after the response). */
export function runQueuedReelJobHere(jobId: string): void {
  after(async () => {
    const claim = await claimQueuedReelJob(jobId, 'vercel-fallback').catch(() => null)
    if (claim) await runClaimedReelJob(jobId, claim)
  })
}

/** Job state for the poller; a job past its limit is reported as failed. */
export async function readReelJob(jobId: string): Promise<(ReelJobView & { by: string }) | null> {
  const snap = await getAdminFirestore().collection(REEL_JOBS_COLLECTION).doc(jobId).get()
  if (!snap.exists) return null
  const d = snap.data() as ReelJobDoc
  const v = view(jobId, d)
  const now = Date.now()
  if (d.status === 'queued' && now - (d.queuedAt ?? d.startedAt) > REEL_JOB_QUEUED_FALLBACK_MS) {
    // The reel worker did not pick it up in time: run it here so the studio never waits.
    runQueuedReelJobHere(jobId)
  }
  if (isRunningJobStale(d, now)) {
    return { ...v, status: 'failed', error: 'Video zamanında üretilemedi (süre aşıldı). Daha kısa bir video ya da fotoğraflarla deneyin.', by: d.by }
  }
  return { ...v, by: d.by }
}

/**
 * Vercel safety net for queued jobs nobody polls (social automation builds): run the
 * oldest ones that waited longer than REEL_JOB_SWEEP_AFTER_MS. Returns the ids it ran.
 */
export async function sweepQueuedReelJobs(opts: { max?: number; now?: number } = {}): Promise<string[]> {
  const now = opts.now ?? Date.now()
  const max = Math.max(1, Math.min(5, opts.max ?? 2))
  const snap = await getAdminFirestore().collection(REEL_JOBS_COLLECTION).where('status', '==', 'queued').limit(20).get()
  const due = snap.docs
    .map((d) => ({ id: d.id, at: Number((d.data() as ReelJobDoc).queuedAt ?? (d.data() as ReelJobDoc).startedAt ?? 0) }))
    .filter((d) => now - d.at > REEL_JOB_SWEEP_AFTER_MS)
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
  const ran: string[] = []
  for (const d of due) {
    const claim = await claimQueuedReelJob(d.id, 'vercel-fallback').catch(() => null)
    if (!claim) continue
    ran.push(d.id)
    await runClaimedReelJob(d.id, claim)
  }
  return ran
}
