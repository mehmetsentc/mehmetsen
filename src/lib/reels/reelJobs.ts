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
 */
import { randomBytes } from 'node:crypto'
import { after } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const REEL_JOBS_COLLECTION = 'reelJobs'
/** A running job older than this is considered dead (function limit 800 s + margin). */
export const REEL_JOB_STALE_MS = 14 * 60 * 1000

export type ReelJobKind = 'build' | 'render' | 'share'
export type ReelJobDoc = {
  kind: ReelJobKind
  newsId: string
  by: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  finishedAt: number | null
  resultJson: string | null
  error: string | null
  httpStatus: number | null
}
export type ReelJobView = {
  jobId: string
  status: ReelJobDoc['status']
  result: unknown
  error: string | null
  httpStatus: number | null
  startedAt: number
  finishedAt: number | null
}

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
  return { jobId, status: d.status, result, error: d.error, httpStatus: d.httpStatus, startedAt: d.startedAt, finishedAt: d.finishedAt }
}

/**
 * Start (or join) a job. `run` returns `{ result, httpStatus }`; a thrown error marks the
 * job failed. Returns immediately; the work continues after the response is sent.
 */
export async function startReelJob(input: {
  jobId: string
  kind: ReelJobKind
  newsId: string
  by: string
  run: () => Promise<{ result: unknown; httpStatus?: number }>
}): Promise<ReelJobView> {
  const ref = getAdminFirestore().collection(REEL_JOBS_COLLECTION).doc(input.jobId)
  const now = Date.now()
  const joined = await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const cur = snap.exists ? (snap.data() as ReelJobDoc) : null
    if (cur && cur.status === 'running' && now - cur.startedAt < REEL_JOB_STALE_MS) return cur
    const doc: ReelJobDoc = {
      kind: input.kind,
      newsId: input.newsId,
      by: input.by,
      status: 'running',
      startedAt: now,
      finishedAt: null,
      resultJson: null,
      error: null,
      httpStatus: null,
    }
    tx.set(ref, doc)
    return null
  })
  if (joined) return view(input.jobId, joined)

  after(async () => {
    try {
      const out = await input.run()
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
  })
  return { jobId: input.jobId, status: 'running', result: null, error: null, httpStatus: null, startedAt: now, finishedAt: null }
}

/** Job state for the poller; a job past the function limit is reported as failed. */
export async function readReelJob(jobId: string): Promise<(ReelJobView & { by: string }) | null> {
  const snap = await getAdminFirestore().collection(REEL_JOBS_COLLECTION).doc(jobId).get()
  if (!snap.exists) return null
  const d = snap.data() as ReelJobDoc
  const v = view(jobId, d)
  if (d.status === 'running' && Date.now() - d.startedAt > REEL_JOB_STALE_MS) {
    return { ...v, status: 'failed', error: 'Video zamanında üretilemedi (süre aşıldı). Daha kısa bir video ya da fotoğraflarla deneyin.', by: d.by }
  }
  return { ...v, by: d.by }
}
