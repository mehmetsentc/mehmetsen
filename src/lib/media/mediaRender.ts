import 'server-only'

/**
 * MEDIA-1 — render one media-project clip to a public MP4 + cover JPEG.
 *
 * Source: the project's Video Kütüphanesi file (rights-cleared, NaHaber storage),
 * downloaded once per render to /tmp (≤ 200 MB). ffmpeg runs without a shell,
 * with a hard time limit. Output lands at
 *   media/{projectId}/{clipId}-{renderKey}.mp4 (+ .jpg)
 * so an unchanged clip is never rendered twice.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { getAdminStorage } from '@/lib/firebase/admin'
import { libraryVideoForReel } from '@/lib/reels/libraryVideo'
import { MAX_SOURCE_BYTES } from '@/lib/reels/sourceVideo'
import { FONT_MD, FONT_XB, ensureFonts, resolveFfmpegPath, roundRectPath } from '@/lib/reels/reelTheme'
import { wrapLines } from '@/lib/reels/timeline'
import { clipFfmpegArgs, OUT_H, OUT_W, type ClipOptions } from './mediaProject'

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ?? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
const DOWNLOAD_TIMEOUT_MS = 120_000
const FFMPEG_TIMEOUT_MS = 540_000

export interface ClipRenderInput {
  projectId: string
  clipId: string
  renderKey: string
  videoItemId: string
  startMs: number
  endMs: number
  title: string
  sourceLabel: string | null
  options: ClipOptions
}

export interface ClipRenderOutput {
  outputUrl: string
  coverUrl: string | null
  seconds: number
  reused: boolean
}

const publicUrl = (name: string) => `https://storage.googleapis.com/${BUCKET}/${name}`

export function clipStoragePath(projectId: string, clipId: string, renderKey: string, ext: 'mp4' | 'jpg'): string {
  return `media/${projectId.replace(/[^A-Za-z0-9_-]/g, '_')}/${clipId}-${renderKey}.${ext}`
}

async function download(url: string, out: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!res.ok || !res.body) throw new Error(`Kaynak video indirilemedi (HTTP ${res.status})`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_SOURCE_BYTES) throw new Error('Kaynak video 200 MB sınırını aşıyor')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > MAX_SOURCE_BYTES) throw new Error('Kaynak video 200 MB sınırını aşıyor')
  if (buf.byteLength === 0) throw new Error('Kaynak video boş')
  await fs.writeFile(out, buf)
}

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d: Buffer) => {
      if (err.length < 4000) err += d.toString()
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Video işleme zaman aşımına uğradı'))
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else {
        // ffmpeg stderr can carry file paths; only a short, path-free hint is surfaced.
        console.warn('[media-render] ffmpeg failed', code, err.replace(/\/[^\s'"]+/g, '<path>').slice(0, 300))
        reject(new Error(`Video işlenemedi (ffmpeg ${code})`))
      }
    })
  })
}

/** Transparent 1080×1920 PNG with the title band, logo and source label (only what is switched on). */
export async function renderOverlayPng(o: { title: string; sourceLabel: string | null; options: ClipOptions; root?: string }): Promise<Buffer | null> {
  const wantTitle = o.options.showTitle && o.title.trim().length > 0
  const wantSource = o.options.showSource && !!o.sourceLabel
  if (!wantTitle && !o.options.showLogo && !wantSource) return null
  const root = o.root ?? process.cwd()
  ensureFonts(root)
  const canvas = createCanvas(OUT_W, OUT_H)
  const ctx = canvas.getContext('2d')

  if (o.options.showLogo) {
    try {
      const tile = await loadImage(await fs.readFile(path.join(root, 'src/lib/reels/assets/brand/logo-tile.png')))
      const h = 96
      const w = (tile.width / tile.height) * h
      ctx.globalAlpha = 0.95
      ctx.drawImage(tile, 56, 120, w, h)
      ctx.globalAlpha = 1
    } catch {
      /* logo is cosmetic */
    }
  }

  if (wantSource) {
    const label = `Kaynak: ${o.sourceLabel}`.slice(0, 60)
    ctx.font = `34px ${FONT_MD}`
    const w = Math.min(OUT_W - 112, ctx.measureText(label).width + 40)
    ctx.fillStyle = 'rgba(7,21,48,0.72)'
    roundRectPath(ctx, OUT_W - 56 - w, 128, w, 64, 16)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.fillText(label, OUT_W - 76, 161, w - 40)
  }

  if (wantTitle) {
    ctx.font = `64px ${FONT_XB}`
    const lines = wrapLines((s) => ctx.measureText(s).width, o.title, OUT_W - 176, 3)
    const lh = 78
    const boxH = lines.length * lh + 64
    const y0 = 1500 - boxH
    ctx.fillStyle = 'rgba(7,21,48,0.82)'
    roundRectPath(ctx, 56, y0, OUT_W - 112, boxH, 24)
    ctx.fill()
    ctx.fillStyle = '#e31b23'
    ctx.fillRect(56, y0 + 24, 10, boxH - 48)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    lines.forEach((l, i) => ctx.fillText(l, 96, y0 + 32 + 56 + i * lh))
  }
  return canvas.toBuffer('image/png')
}

export async function renderClip(input: ClipRenderInput): Promise<ClipRenderOutput> {
  const bucket = getAdminStorage().bucket(BUCKET)
  const mp4Name = clipStoragePath(input.projectId, input.clipId, input.renderKey, 'mp4')
  const jpgName = clipStoragePath(input.projectId, input.clipId, input.renderKey, 'jpg')
  const seconds = (input.endMs - input.startMs) / 1000

  const [exists] = await bucket.file(mp4Name).exists().catch(() => [false] as [boolean])
  if (exists) {
    const [jpg] = await bucket.file(jpgName).exists().catch(() => [false] as [boolean])
    return { outputUrl: publicUrl(mp4Name), coverUrl: jpg ? publicUrl(jpgName) : null, seconds, reused: true }
  }

  const src = await libraryVideoForReel(input.videoItemId)
  if ('error' in src) throw new Error(src.error)

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-'))
  try {
    const inPath = path.join(dir, 'source')
    const outPath = path.join(dir, 'out.mp4')
    const jpgPath = path.join(dir, 'cover.jpg')
    await download(src.url, inPath)
    const png = input.options.frame === 'vertical' ? await renderOverlayPng({ title: input.title, sourceLabel: input.sourceLabel, options: input.options }) : null
    const pngPath = png ? path.join(dir, 'overlay.png') : null
    if (png && pngPath) await fs.writeFile(pngPath, png)
    const ffmpeg = await resolveFfmpegPath()
    await run(ffmpeg, clipFfmpegArgs({ input: inPath, overlay: pngPath, output: outPath, startMs: input.startMs, endMs: input.endMs, options: input.options }), FFMPEG_TIMEOUT_MS)
    // Cover: a frame one second in (or the middle of a very short clip).
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', Math.min(1, seconds / 2).toFixed(2), '-i', outPath, '-frames:v', '1', '-q:v', '3', jpgPath], 60_000).catch(() => undefined)

    await bucket.file(mp4Name).save(await fs.readFile(outPath), { resumable: false, metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=86400' } })
    await bucket.file(mp4Name).makePublic()
    let coverUrl: string | null = null
    try {
      await bucket.file(jpgName).save(await fs.readFile(jpgPath), { resumable: false, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' } })
      await bucket.file(jpgName).makePublic()
      coverUrl = publicUrl(jpgName)
    } catch {
      coverUrl = null
    }
    return { outputUrl: publicUrl(mp4Name), coverUrl, seconds, reused: false }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
