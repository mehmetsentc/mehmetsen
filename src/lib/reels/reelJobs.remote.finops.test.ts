import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── in-memory Firestore fake (only what reelJobs.ts uses) ──
const store = new Map<string, Record<string, unknown>>()
const afterQueue: Array<() => unknown> = []
let owner: 'vercel' | 'railway' = 'vercel'
const handlerCalls: Array<{ name: string; args: unknown }> = []

function docRef(id: string) {
  return {
    id,
    async get() {
      const d = store.get(id)
      return { exists: !!d, id, data: () => (d ? { ...d } : undefined) }
    },
    async set(v: Record<string, unknown>, o?: { merge?: boolean }) {
      store.set(id, o?.merge ? { ...(store.get(id) ?? {}), ...v } : { ...v })
    },
  }
}
const db = {
  collection: () => ({
    doc: (id: string) => docRef(id),
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        async get() {
          const docs = [...store.entries()]
            .filter(([, d]) => d[field] === value)
            .map(([id, d]) => ({ id, data: () => ({ ...d }) }))
          return { docs }
        },
      }),
    }),
  }),
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const tx = {
      get: (ref: ReturnType<typeof docRef>) => ref.get(),
      set: (ref: ReturnType<typeof docRef>, v: Record<string, unknown>) => void store.set(ref.id, { ...v }),
      update: (ref: ReturnType<typeof docRef>, v: Record<string, unknown>) =>
        void store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...v }),
    }
    return fn(tx)
  },
}

vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => db }))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void afterQueue.push(fn) }))
vi.mock('./reelJobOwner', () => ({ readReelJobsOwner: async () => owner }))
vi.mock('./reelJobHandlers', () => ({
  isReelJobHandlerName: (n: string) => n === 'reels.render' || n === 'boom',
  runReelJobHandler: async (name: string, args: unknown) => {
    handlerCalls.push({ name, args })
    if (name === 'boom') throw new Error('patladı')
    return { result: { ok: true, name }, httpStatus: 200 }
  },
}))

const jobs = await import('./reelJobs')
const { parseReelJobsOwner } = await vi.importActual<typeof import('./reelJobOwner')>('./reelJobOwner')

async function drain() {
  while (afterQueue.length) await afterQueue.shift()!()
}

beforeEach(() => {
  store.clear()
  afterQueue.length = 0
  handlerCalls.length = 0
  owner = 'vercel'
})

describe('FinOps reel job owner flag', () => {
  it('only an exact railway value moves jobs; anything else stays on vercel', () => {
    expect(parseReelJobsOwner('railway')).toBe('railway')
    expect(parseReelJobsOwner(' Railway \n')).toBe('railway')
    for (const v of ['vercel', '', null, undefined, 1, 'rail', 'true']) expect(parseReelJobsOwner(v)).toBe('vercel')
  })
})

describe('FinOps reel jobs — remote runner', () => {
  const remote = { handler: 'reels.render', args: { newsId: 'n1' } }

  it('owner vercel: runs locally in after(), exactly as before', async () => {
    const run = vi.fn(async () => ({ result: { local: true } }))
    const v = await jobs.startReelJob({ jobId: 'build_n1', kind: 'build', newsId: 'n1', by: 'u', run, remote })
    expect(v.status).toBe('running')
    expect(store.get('build_n1')).toMatchObject({ status: 'running', runner: 'vercel', handler: null })
    await drain()
    expect(run).toHaveBeenCalledOnce()
    expect(store.get('build_n1')).toMatchObject({ status: 'done', httpStatus: 200 })
  })

  it('owner railway: queues the job and does not run it here', async () => {
    owner = 'railway'
    const run = vi.fn(async () => ({ result: 1 }))
    const v = await jobs.startReelJob({ jobId: 'build_n1', kind: 'build', newsId: 'n1', by: 'u', run, remote })
    expect(v.status).toBe('running') // the studio sees queued as running
    expect(store.get('build_n1')).toMatchObject({ status: 'queued', handler: 'reels.render', argsJson: '{"newsId":"n1"}' })
    expect(afterQueue).toHaveLength(0)
    expect(run).not.toHaveBeenCalled()
  })

  it('owner railway without a remote handler still runs locally', async () => {
    owner = 'railway'
    const run = vi.fn(async () => ({ result: 1 }))
    await jobs.startReelJob({ jobId: 'job_abcdef', kind: 'render', newsId: 'n1', by: 'u', run })
    expect(store.get('job_abcdef')).toMatchObject({ status: 'running', runner: 'vercel' })
    await drain()
    expect(run).toHaveBeenCalledOnce()
  })

  it('a second click joins the queued job instead of queueing twice', async () => {
    owner = 'railway'
    const run = vi.fn(async () => ({ result: 1 }))
    await jobs.startReelJob({ jobId: 'build_n1', kind: 'build', newsId: 'n1', by: 'u', run, remote })
    const before = { ...store.get('build_n1') }
    await jobs.startReelJob({ jobId: 'build_n1', kind: 'build', newsId: 'n1', by: 'u', run, remote })
    expect(store.get('build_n1')).toEqual(before)
  })

  it('claim is exclusive: only one runner gets a queued job', async () => {
    owner = 'railway'
    await jobs.startReelJob({ jobId: 'build_n1', kind: 'build', newsId: 'n1', by: 'u', run: async () => ({ result: 1 }), remote })
    const a = await jobs.claimQueuedReelJob('build_n1', 'railway')
    const b = await jobs.claimQueuedReelJob('build_n1', 'vercel-fallback')
    expect(a).toEqual({ handler: 'reels.render', args: { newsId: 'n1' }, by: 'u' })
    expect(b).toBeNull()
    expect(store.get('build_n1')).toMatchObject({ status: 'running', runner: 'railway' })
    await jobs.runClaimedReelJob('build_n1', a!)
    expect(handlerCalls).toEqual([{ name: 'reels.render', args: { newsId: 'n1' } }])
    expect(store.get('build_n1')).toMatchObject({ status: 'done', resultJson: '{"ok":true,"name":"reels.render"}' })
  })

  it('a failing handler marks the job failed with its message', async () => {
    store.set('j_boom1', { status: 'queued', handler: 'boom', argsJson: '{}', queuedAt: Date.now(), startedAt: Date.now(), by: 'u' })
    const c = await jobs.claimQueuedReelJob('j_boom1', 'railway')
    await jobs.runClaimedReelJob('j_boom1', c!)
    expect(store.get('j_boom1')).toMatchObject({ status: 'failed', error: 'patladı', httpStatus: 500 })
  })

  it('an unknown handler fails instead of hanging', async () => {
    store.set('j_unk01', { status: 'queued', handler: 'nope', argsJson: '{}', queuedAt: Date.now(), startedAt: Date.now(), by: 'u' })
    const c = await jobs.claimQueuedReelJob('j_unk01', 'railway')
    await jobs.runClaimedReelJob('j_unk01', c!)
    expect(store.get('j_unk01')).toMatchObject({ status: 'failed' })
    expect(handlerCalls).toHaveLength(0)
  })

  it('poll fallback: a job still queued after 45 s is run by Vercel', async () => {
    const t = Date.now() - jobs.REEL_JOB_QUEUED_FALLBACK_MS - 1000
    store.set('build_n1', { status: 'queued', handler: 'reels.render', argsJson: '{"newsId":"n1"}', queuedAt: t, startedAt: t, by: 'u' })
    const v = await jobs.readReelJob('build_n1')
    expect(v?.status).toBe('running')
    await drain()
    expect(store.get('build_n1')).toMatchObject({ status: 'done', runner: 'vercel-fallback' })
  })

  it('poll before 45 s leaves the job for the worker', async () => {
    const t = Date.now() - 5000
    store.set('build_n1', { status: 'queued', handler: 'reels.render', argsJson: '{}', queuedAt: t, startedAt: t, by: 'u' })
    await jobs.readReelJob('build_n1')
    expect(afterQueue).toHaveLength(0)
    expect(store.get('build_n1')).toMatchObject({ status: 'queued' })
  })

  it('a railway job without heartbeat for 3 min is reported failed; a fresh heartbeat keeps it alive', async () => {
    const now = Date.now()
    expect(jobs.isRunningJobStale({ status: 'running', runner: 'railway', startedAt: now - 10 * 60_000, heartbeatAt: now - 10_000 }, now)).toBe(false)
    expect(jobs.isRunningJobStale({ status: 'running', runner: 'railway', startedAt: now - 10 * 60_000, heartbeatAt: now - 4 * 60_000 }, now)).toBe(true)
    expect(jobs.isRunningJobStale({ status: 'running', runner: 'vercel', startedAt: now - 10 * 60_000, heartbeatAt: null }, now)).toBe(false)
    expect(jobs.isRunningJobStale({ status: 'running', runner: 'vercel', startedAt: now - 15 * 60_000, heartbeatAt: null }, now)).toBe(true)
  })

  it('sweep runs only queued jobs older than 2 min, oldest first, capped', async () => {
    const now = Date.now()
    const q = (id: string, ago: number) =>
      store.set(id, { status: 'queued', handler: 'reels.render', argsJson: `{"id":"${id}"}`, queuedAt: now - ago, startedAt: now - ago, by: 'u' })
    q('job_new001', 30_000)
    q('job_old001', 5 * 60_000)
    q('job_old002', 9 * 60_000)
    q('job_old003', 3 * 60_000)
    const ran = await jobs.sweepQueuedReelJobs({ max: 2, now })
    expect(ran).toEqual(['job_old002', 'job_old001'])
    expect(store.get('job_new001')).toMatchObject({ status: 'queued' })
    expect(store.get('job_old003')).toMatchObject({ status: 'queued' })
  })
})
