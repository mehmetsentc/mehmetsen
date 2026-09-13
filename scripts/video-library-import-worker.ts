/**
 * Video Library import worker — long-running CPU process, concurrency 1.
 *
 * Usage:
 *   VIDEO_LIBRARY_IMPORT_ENABLED=true npx tsx scripts/video-library-import-worker.ts --once
 *   npm run video:import-worker
 *
 * Reuses processOneImportJob. Does not transcode, run FFmpeg, or publish news.
 * Vercel cron remains 1 job / 5 min and is not the bulk path.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getStorage, isR2Configured } from '../src/lib/storage'
import { isVideoLibraryImportEnabled } from '../src/video/featureFlag'
import { videoImportStore } from '../src/video/importer/store'
import { processOneImportJob } from '../src/video/importer/worker'

const IMPORT_CONCURRENCY = 1

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

loadEnvFile('.env.local')
loadEnvFile('.env')

function refuseRemoteDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  const allowRemote = process.env.VIDEO_LIBRARY_IMPORT_ALLOW_REMOTE_DB === 'true'
  if (!allowRemote && /neon\.tech|amazonaws\.com|supabase\.co/i.test(url)) {
    throw new Error(
      'Refusing remote DATABASE_URL. Set VIDEO_LIBRARY_IMPORT_ALLOW_REMOTE_DB=true to override (not for VL-P1).'
    )
  }
}

async function main() {
  if (!isVideoLibraryImportEnabled()) {
    console.log(JSON.stringify({ skipped: true, reason: 'VIDEO_LIBRARY_IMPORT_ENABLED=false' }))
    return
  }
  refuseRemoteDb()
  if (IMPORT_CONCURRENCY !== 1) {
    throw new Error('VL-P1 import concurrency must be 1')
  }
  if (!isR2Configured()) {
    throw new Error('R2_NOT_CONFIGURED')
  }

  const once = process.argv.includes('--once') || !process.argv.includes('--loop')
  console.log(
    JSON.stringify({
      worker: 'video-library-import',
      concurrency: IMPORT_CONCURRENCY,
      mode: once ? 'once' : 'loop',
    })
  )

  let running = false
  const tick = async () => {
    if (running) return { outcome: 'IDLE' as const }
    running = true
    try {
      const result = await processOneImportJob({
        store: videoImportStore,
        storage: getStorage(),
        workerId: 'cli-video-library-import-worker',
      })
      console.log(JSON.stringify(result))
      return result
    } finally {
      running = false
    }
  }

  if (once) {
    await tick()
    return
  }

  while (true) {
    const result = await tick()
    if (result && result.outcome === 'IDLE') {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
