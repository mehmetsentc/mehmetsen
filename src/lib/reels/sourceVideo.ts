import 'server-only'

/**
 * The news item's own video, made available to the reel renderer as a LOCAL file.
 *
 * - NaHaber storage files are downloaded to a temp file.
 * - External direct files (MP4/MOV/WebM) and HLS streams (.m3u8) are copied
 *   ONCE into NaHaber Storage (`videos/source/{key}.mp4`) and reused afterwards,
 *   so a slow or disappearing source never blocks a later share.
 * - Every step has a hard time limit (no unbounded ffmpeg / fetch): a source
 *   that cannot be read in time is reported, and the caller falls back to the
 *   story's photos instead of hanging.
 * - YouTube / player pages are never handled here (see newsVideo.ts).
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAdminStorage } from '@/lib/firebase/admin'

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`

export const MAX_SOURCE_BYTES = 200 * 1024 * 1024
/** Download budget for a direct file (Reels routes allow 300 s in total). */
export const DOWNLOAD_TIMEOUT_MS = 90_000
/** HLS → MP4 copy budget; only the first SOURCE_MAX_SECONDS are kept (a reel is < 90 s). */
export const HLS_TIMEOUT_MS = 90_000
export const SOURCE_MAX_SECONDS = 180

export type SourceVideoResult =
  | { ok: true; path: string; stored: boolean; storedUrl: string | null }
  | { ok: false; reason: 'too_large' | 'download_failed' | 'timeout' | 'hls_failed' | 'empty' }

export function sourceStoragePath(key: string, url: string): string {
  const safe = key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)
  const h = createHash('sha1').update(url).digest('hex').slice(0, 10)
  return `videos/source/${safe}-${h}.mp4`
}

function tmpFile(tag: string): string {
  return path.join(os.tmpdir(), `reel-src-${tag.replace(/[^A-Za-z0-9_-]/g, '_')}-${Date.now()}.mp4`)
}

async function download(url: string, out: string): Promise<SourceVideoResult> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: 'follow' })
  } catch (err) {
    return { ok: false, reason: err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'download_failed' }
  }
  if (!res.ok || !res.body) return { ok: false, reason: 'download_failed' }
  const len = Number(res.headers.get('content-length') || 0)
  if (len > MAX_SOURCE_BYTES) return { ok: false, reason: 'too_large' }
  try {
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return { ok: false, reason: 'empty' }
    if (buf.length > MAX_SOURCE_BYTES) return { ok: false, reason: 'too_large' }
    await fs.writeFile(out, buf)
    return { ok: true, path: out, stored: false, storedUrl: null }
  } catch (err) {
    return { ok: false, reason: err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'download_failed' }
  }
}

/** HLS → MP4 (stream copy, AAC fix-up), bounded in time and length. */
async function hlsToMp4(ffmpeg: string, url: string, out: string): Promise<SourceVideoResult> {
  return new Promise((resolve) => {
    const p = spawn(
      ffmpeg,
      ['-v', 'error', '-y', '-rw_timeout', '15000000', '-i', url, '-t', String(SOURCE_MAX_SECONDS), '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', out],
      { stdio: ['ignore', 'ignore', 'ignore'] },
    )
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      p.kill('SIGKILL')
    }, HLS_TIMEOUT_MS)
    p.on('close', async (code) => {
      clearTimeout(timer)
      if (timedOut) return resolve({ ok: false, reason: 'timeout' })
      const size = await fs.stat(out).then((s) => s.size).catch(() => 0)
      resolve(code === 0 && size > 0 ? { ok: true, path: out, stored: false, storedUrl: null } : { ok: false, reason: 'hls_failed' })
    })
    p.on('error', () => {
      clearTimeout(timer)
      resolve({ ok: false, reason: 'hls_failed' })
    })
  })
}

/**
 * Local copy of the news video for rendering.
 * `storeKey` (the news id) enables the one-time copy of EXTERNAL sources into Storage.
 */
export async function prepareSourceVideo(input: {
  url: string
  origin: 'nahaber' | 'external'
  hls: boolean
  tag: string
  storeKey?: string | null
  ffmpeg?: () => Promise<string>
}): Promise<SourceVideoResult> {
  const out = tmpFile(input.tag)
  const bucket = input.origin === 'external' && input.storeKey ? getAdminStorage().bucket(BUCKET) : null
  const stored = bucket ? bucket.file(sourceStoragePath(input.storeKey!, input.url)) : null

  // Reuse an earlier copy of an external source.
  if (stored) {
    try {
      const [exists] = await stored.exists()
      if (exists) {
        await stored.download({ destination: out })
        return { ok: true, path: out, stored: true, storedUrl: `https://storage.googleapis.com/${BUCKET}/${stored.name}` }
      }
    } catch {
      // fall through to the source
    }
  }

  let r: SourceVideoResult
  if (input.hls) {
    const resolveFfmpeg = input.ffmpeg ?? (async () => (await import('./reelTheme')).resolveFfmpegPath())
    r = await hlsToMp4(await resolveFfmpeg(), input.url, out)
  } else {
    r = await download(input.url, out)
  }
  if (!r.ok || !stored) return r

  try {
    await stored.save(await fs.readFile(r.path), {
      resumable: false,
      metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=86400', metadata: { source: input.url.slice(0, 500) } },
    })
    await stored.makePublic().catch(() => undefined)
    return { ok: true, path: r.path, stored: true, storedUrl: `https://storage.googleapis.com/${BUCKET}/${stored.name}` }
  } catch {
    // The reel can still be rendered from the local copy.
    return r
  }
}
