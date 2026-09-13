/**
 * Video Library processing worker — runs OUTSIDE the Next.js request lifecycle.
 *
 * Usage:
 *   VIDEO_LIBRARY_PROCESS_ENABLED=true npx tsx scripts/video-processing-worker.ts --once
 *   npm run video:process-worker
 *
 * Architecture: Postgres PROCESS jobs → FFmpeg (spawn argv) → R2 or local object root.
 * Do not invoke from page/API routes. Production deploy of this worker is out of V1C.1 scope.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROCESS_CONCURRENCY } from '../src/video/processing/limits'
import { processOneProcessJob } from '../src/video/processing/worker'
import { createVideoObjectStoreFromEnv } from '../src/video/processing/objectStore'
import { videoImportStore } from '../src/video/importer/store'
import { detectBinaryVersion, ffmpegBin, ffprobeBin } from '../src/video/processing/spawn'
import { isVideoLibraryProcessEnabled } from '../src/video/featureFlag'

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
  const allowRemote = process.env.VIDEO_LIBRARY_PROCESS_ALLOW_REMOTE_DB === 'true'
  if (!allowRemote && /neon\.tech|amazonaws\.com|supabase\.co/i.test(url)) {
    throw new Error(
      'Refusing remote DATABASE_URL. Set VIDEO_LIBRARY_PROCESS_ALLOW_REMOTE_DB=true to override (not for V1C.1).'
    )
  }
}

async function main() {
  if (!isVideoLibraryProcessEnabled()) {
    console.log(JSON.stringify({ skipped: true, reason: 'VIDEO_LIBRARY_PROCESS_ENABLED=false' }))
    return
  }
  refuseRemoteDb()
  if (PROCESS_CONCURRENCY !== 1) {
    throw new Error('V1C.1 processing concurrency must be 1')
  }

  const ffmpegVersion = await detectBinaryVersion(ffmpegBin())
  const ffprobeVersion = await detectBinaryVersion(ffprobeBin())
  const storage = await createVideoObjectStoreFromEnv()
  const once = process.argv.includes('--once') || !process.argv.includes('--loop')

  console.log(
    JSON.stringify({
      ffmpeg: ffmpegVersion,
      ffprobe: ffprobeVersion,
      concurrency: PROCESS_CONCURRENCY,
      mode: once ? 'once' : 'loop',
    })
  )

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const result = await processOneProcessJob({
        store: videoImportStore,
        storage,
        workerId: 'cli-video-processing-worker',
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
