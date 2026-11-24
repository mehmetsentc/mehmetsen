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
import { clipSeconds, OUT_H, OUT_W, type ClipOptions, type MsRange } from './mediaProject'
import { clipEditArgs, frameSize } from './clipEdit'
import { composeOutroStill } from '@/lib/story/storyOverlay'
import { FRAMES } from '@/lib/story/storyProject'

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
  /** VIDEO-KES: ranges removed from inside the clip */
  cuts?: MsRange[]
  /** HABER-VIDEO: the news item's own video file (instead of a library item) */
  sourceFileUrl?: string | null
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

/** Size + audio presence from the ffmpeg banner (no ffprobe in the bundle). */
function probeVideo(bin: string, src: string): Promise<{ width: number; height: number; hasAudio: boolean }> {
  return new Promise((resolve) => {
    const p = spawn(bin, ['-hide_banner', '-i', src], { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    const timer = setTimeout(() => p.kill('SIGKILL'), 20_000)
    p.stderr.on('data', (d: Buffer) => {
      if (err.length < 20000) err += d.toString()
    })
    p.on('close', () => {
      clearTimeout(timer)
      const m = err.match(/Video:.*?(\d{2,5})x(\d{2,5})/)
      const rot = /rotate\s*:\s*-?(90|270)|rotation of -?(90|270)/.test(err)
      const w = m ? Number(m[1]) : 0
      const h = m ? Number(m[2]) : 0
      resolve({ width: rot ? h : w, height: rot ? w : h, hasAudio: /Stream #\d+:\d+.*Audio:/.test(err) })
    })
    p.on('error', () => {
      clearTimeout(timer)
      resolve({ width: 0, height: 0, hasAudio: false })
    })
  })
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
  const seconds = clipSeconds(input)

  const [exists] = await bucket.file(mp4Name).exists().catch(() => [false] as [boolean])
  if (exists) {
    const [jpg] = await bucket.file(jpgName).exists().catch(() => [false] as [boolean])
    return { outputUrl: publicUrl(mp4Name), coverUrl: jpg ? publicUrl(jpgName) : null, seconds, reused: true }
  }

  const src = input.sourceFileUrl ? { url: input.sourceFileUrl } : await libraryVideoForReel(input.videoItemId)
  if ('error' in src) throw new Error(src.error)

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-'))
  try {
    const inPath = path.join(dir, 'source')
    const outPath = path.join(dir, 'out.mp4')
    const jpgPath = path.join(dir, 'cover.jpg')
    if (input.sourceFileUrl) {
      // HABER-VIDEO: NaHaber storage / external MP4 or HLS → local MP4 (≤ 200 MB, time-boxed)
      const { prepareSourceVideo } = await import('@/lib/reels/sourceVideo')
      const url = input.sourceFileUrl
      const v = await prepareSourceVideo({
        url,
        origin: /firebasestorage|storage\.googleapis\.com|nahaber\.com|r2\.dev/i.test(url) ? 'nahaber' : 'external',
        hls: /\.m3u8(\?|$)/i.test(url),
        tag: `media_${input.projectId}`,
      })
      if (!v.ok) throw new Error('Haberin videosu indirilemedi')
      await fs.copyFile(v.path, inPath)
      await fs.rm(v.path, { force: true }).catch(() => undefined)
    } else await download(src.url, inPath)
    const png = input.options.frame === 'vertical' && input.options.fit !== 'crop' ? await renderOverlayPng({ title: input.title, sourceLabel: input.sourceLabel, options: input.options }) : null
    const pngPath = png ? path.join(dir, 'overlay.png') : null
    if (png && pngPath) await fs.writeFile(pngPath, png)
    const ffmpeg = await resolveFfmpegPath()
    // OUTRO-ALL: every clip closes with the nahaber.com card (shape follows the clip)
    const info = await probeVideo(ffmpeg, inPath)
    const fr = input.options.frame
    const portrait = fr === 'vertical' || fr === 'portrait45' || (fr === 'original' && info.height > info.width)
    const outroPath = path.join(dir, 'outro.jpg')
    let outro: { image: string; sting: string | null; hasAudio: boolean } | null = null
    if (input.options.outro !== false) try {
      // the card is drawn at the clip's own shape (1:1, 4:5 … are not stretched)
      const dims = frameSize(input.options) ?? (info.width && info.height ? [info.width, info.height] : portrait ? [1080, 1920] : [1920, 1080])
      const base = dims[1] > dims[0] ? FRAMES.vertical : FRAMES.horizontal
      const k = Math.max(1, 1080 / Math.min(dims[0], dims[1]))
      const cw = Math.round(dims[0] * k)
      const ch = Math.round(dims[1] * k)
      await composeOutroStill({ style: 'haber', outFile: outroPath, frame: { ...base, w: cw, h: ch, stillW: cw, stillH: ch } })
      const sting = path.join(process.cwd(), 'src/lib/reels/assets/audio/broadcast/outro-soft.wav')
      outro = { image: outroPath, sting: (await fs.stat(sting).then(() => true).catch(() => false)) ? sting : null, hasAudio: info.hasAudio }
    } catch (err) {
      console.warn('[media-render] kapanış kartı hazırlanamadı', err instanceof Error ? err.message : err)
    }
    await run(ffmpeg, clipEditArgs({ input: inPath, overlay: pngPath, output: outPath, startMs: input.startMs, endMs: input.endMs, cuts: input.cuts, options: input.options, outro, hasAudio: info.hasAudio }), FFMPEG_TIMEOUT_MS)
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
