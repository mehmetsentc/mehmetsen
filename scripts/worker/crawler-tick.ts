/**
 * FinOps (15 Nov 2026): the 30-minute crawler tick as a standalone worker (Railway cron).
 * Same code path as GET /api/cron/crawler/tick, without Vercel function CPU/memory billing.
 *
 *   npx tsx --tsconfig scripts/worker/tsconfig.json scripts/worker/crawler-tick.ts [--force] [--check]
 *
 * Runs only while Neon `crawler_tick_owner` = 'railway' (see src/services/crawler/ops/tickOwner.ts),
 * so Vercel and Railway never both own the tick. --force (or WORKER_FORCE=1) ignores the owner
 * flag and the night cadence for a manual run. --check only loads the modules and exits.
 */
import { drainAfter } from './shims/nextServer'

const HARD_TIMEOUT_MS = Number(process.env.WORKER_HARD_TIMEOUT_MS || 9 * 60 * 1000)

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const force = args.includes('--force') || process.env.WORKER_FORCE === '1'
  const t0 = Date.now()

  const { runCrawlerTick } = await import('@/services/crawler/workers/tick')
  const { shouldSkipNightTick } = await import('@/services/crawler/ops/nightCadence')
  const { readCrawlerTickOwner } = await import('@/services/crawler/ops/tickOwner')
  const { submitFreshNewsToIndexNow } = await import('@/lib/seo/indexNowBatch')

  if (args.includes('--check')) {
    console.log(JSON.stringify({ ok: true, check: true, loaded: [typeof runCrawlerTick, typeof submitFreshNewsToIndexNow] }))
    return 0
  }

  if (!force) {
    const owner = await readCrawlerTickOwner()
    if (owner !== 'railway') {
      console.log(JSON.stringify({ ok: true, skipped: true, reason: `OWNER_${owner.toUpperCase()}` }))
      return 0
    }
    if (shouldSkipNightTick(new Date())) {
      console.log(JSON.stringify({ ok: true, skipped: true, reason: 'NIGHT_CADENCE' }))
      return 0
    }
  }

  const result = await runCrawlerTick()
  let indexNow: unknown
  try {
    indexNow = await submitFreshNewsToIndexNow()
  } catch (err) {
    indexNow = { error: err instanceof Error ? err.message.slice(0, 120) : 'failed' }
  }
  await drainAfter()
  console.log(JSON.stringify({ ok: true, force, ms: Date.now() - t0, result, indexNow }))
  return 0
}

const watchdog = setTimeout(() => {
  console.error(`[worker] hard timeout after ${HARD_TIMEOUT_MS} ms`)
  process.exit(2)
}, HARD_TIMEOUT_MS)
watchdog.unref()

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[worker] crawler tick failed:', error)
    process.exit(1)
  })
