/**
 * Local CLI: run local news worker without HTTP (Firebase Admin SDK).
 *
 * Usage:
 *   LOCAL_NEWS_MAX_PROVINCES=81 LOCAL_NEWS_ITEMS_PER_SOURCE=5 npm run newsroom-local-direct
 *   npm run newsroom-process-queue-direct
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runLocalWorker } from '../src/services/newsroom/workers/localWorker'
import { processNewsQueue } from '../src/services/newsroom/queue/queueProcessor'
import { countLocalNewsSourceCatalog } from '../src/services/newsroom/sources/localSources'

function loadEnvFile(filename: string) {
  const path = join(process.cwd(), filename)
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : fallback
}

async function main() {
  loadEnvFile('.env.local')
  loadEnvFile('.env')

  const mode = process.argv[2] ?? 'worker'
  const catalog = countLocalNewsSourceCatalog()

  if (mode === 'queue' || mode === 'process-queue') {
    const batchSize = Number(readArg('batch', readArg('batchSize', '12')))
    const stats = await processNewsQueue(undefined, Number.isFinite(batchSize) ? batchSize : 12)
    console.log('Queue processed:', JSON.stringify(stats, null, 2))
    return
  }

  const worker = await runLocalWorker()
  console.log('Local worker complete:', JSON.stringify(worker, null, 2))
  console.log(
    'Source catalog:',
    JSON.stringify(
      {
        ...catalog,
        runtimeSources: worker.sourcesChecked,
        provincesConfigured: catalog.googleNewsProvinces,
      },
      null,
      2
    )
  )

  const processQueue = process.argv.includes('--process-queue')
  if (processQueue) {
    let rounds = Number(readArg('rounds', '6'))
    if (!Number.isFinite(rounds) || rounds < 1) rounds = 6
    for (let i = 0; i < rounds; i += 1) {
      const stats = await processNewsQueue(undefined, 12)
      console.log(`Queue round ${i + 1}:`, JSON.stringify(stats, null, 2))
      if (stats.picked === 0) break
    }
  }
}

main().catch((error) => {
  console.error('Local news direct run failed:', error)
  process.exit(1)
})
