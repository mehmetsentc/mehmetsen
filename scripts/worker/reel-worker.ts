/**
 * FinOps (25 Nov 2026): Railway reel / video render worker (always-on service).
 *
 *   npx tsx --tsconfig scripts/worker/tsconfig.json scripts/worker/reel-worker.ts [--check]
 *
 * Runs the jobs that reelJobs.ts QUEUES when the Neon flag `reel_jobs_owner` = 'railway':
 * watches Firestore `reelJobs` (status == 'queued'), claims a job in a transaction and
 * runs the same handler the Vercel route would run (src/lib/reels/reelJobHandlers.ts).
 * While a job runs it writes `heartbeatAt` every 30 s; a job without a heartbeat for 3 min
 * is treated as dead by the studio. Jobs the worker does not take within 45 s (studio poll)
 * or 2 min (automation, sweep cron) are run by Vercel itself — the worker can stop at any
 * time without blocking anything.
 *
 * With the flag on 'vercel' nothing is queued and this process only idles.
 * --check loads every module and exits (CI / image smoke test).
 */
import { drainAfter } from './shims/nextServer'

const CONCURRENCY = Math.max(1, Number(process.env.REEL_WORKER_CONCURRENCY || 2))
const SCAN_MS = Number(process.env.REEL_WORKER_SCAN_MS || 15_000)
const SHUTDOWN_GRACE_MS = 10 * 60 * 1000

async function main(): Promise<void> {
  const { getAdminFirestore } = await import('@/lib/firebase/admin')
  const jobs = await import('@/lib/reels/reelJobs')
  const { readReelJobsOwner } = await import('@/lib/reels/reelJobOwner')
  const handlers = await import('@/lib/reels/reelJobHandlers')

  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ ok: true, check: true, handlers: Object.keys(handlers.REEL_JOB_HANDLERS) }))
    process.exit(0)
  }

  const db = getAdminFirestore()
  const col = db.collection(jobs.REEL_JOBS_COLLECTION)
  const running = new Set<string>()
  let stopping = false
  let scanning = false

  async function runOne(id: string): Promise<void> {
    const claim = await jobs.claimQueuedReelJob(id, 'railway').catch((err) => {
      console.warn('[reel-worker] claim failed', id, err instanceof Error ? err.message : err)
      return null
    })
    if (!claim) return
    running.add(id)
    const t0 = Date.now()
    console.log(JSON.stringify({ event: 'start', jobId: id, handler: claim.handler }))
    const hb = setInterval(() => {
      col.doc(id).update({ heartbeatAt: Date.now() }).catch(() => undefined)
    }, jobs.REEL_JOB_HEARTBEAT_MS)
    try {
      await jobs.runClaimedReelJob(id, claim)
      await drainAfter()
      const after = (await col.doc(id).get()).data() as { status?: string; error?: string | null } | undefined
      console.log(JSON.stringify({ event: 'end', jobId: id, handler: claim.handler, status: after?.status, error: after?.error ?? null, ms: Date.now() - t0 }))
    } finally {
      clearInterval(hb)
      running.delete(id)
      void scan()
    }
  }

  async function scan(): Promise<void> {
    if (stopping || scanning || running.size >= CONCURRENCY) return
    scanning = true
    try {
      if ((await readReelJobsOwner()) !== 'railway') return
      const snap = await col.where('status', '==', 'queued').limit(20).get()
      const queued = snap.docs
        .map((d) => ({ id: d.id, at: Number(d.get('queuedAt') ?? d.get('startedAt') ?? 0) }))
        .sort((a, b) => a.at - b.at)
      for (const q of queued) {
        if (stopping || running.size >= CONCURRENCY) break
        if (running.has(q.id)) continue
        void runOne(q.id)
      }
    } catch (err) {
      console.warn('[reel-worker] scan failed', err instanceof Error ? err.message : err)
    } finally {
      scanning = false
    }
  }

  // New jobs arrive within a second via the listener; the interval is the fallback.
  const unsubscribe = col.where('status', '==', 'queued').onSnapshot(
    () => void scan(),
    (err) => console.warn('[reel-worker] listener error', err.message),
  )
  const timer = setInterval(() => void scan(), SCAN_MS)

  const shutdown = async (signal: string) => {
    if (stopping) return
    stopping = true
    console.log(JSON.stringify({ event: 'shutdown', signal, running: [...running] }))
    unsubscribe()
    clearInterval(timer)
    const deadline = Date.now() + SHUTDOWN_GRACE_MS
    while (running.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1000))
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  console.log(JSON.stringify({ event: 'ready', concurrency: CONCURRENCY }))
  void scan()
}

main().catch((error) => {
  console.error('[reel-worker] fatal:', error)
  process.exit(1)
})
