import 'server-only'

/**
 * REELS-1 — server renderer for the NaHaber news reel (1080×1920, 30 fps, H.264 + AAC).
 *
 * Layout (matches the approved prototype): blurred backdrop, rounded media card with
 * slow Ken Burns (image) or the story's own video, NaHaber wordmark + place chip,
 * red category chip, typewriter headline with caret, summary, CTA pill, end card.
 * Audio: Google TTS voice + NaHaber bed/stings/sfx (own synthesized WAVs in ./assets/audio).
 * Fonts: Inter (SIL OFL 1.1, ./assets/fonts/OFL.txt).
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas, GlobalFonts, loadImage, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import {
  REEL_FPS,
  REEL_H,
  REEL_W,
  TYPE_CPS,
  buildTimeline,
  clickTimes,
  ease,
  wrapLines,
  type ReelTimeline,
} from './timeline'
import { audioFilterGraph, buildFxTrack, readWav, wavSeconds, writeWav } from './audio'

export type ReelMedia =
  | { kind: 'image'; data: Buffer }
  | { kind: 'video'; path: string }
  | { kind: 'none' }

export type ReelInput = {
  headline: string
  summary: string
  category: string
  place?: string | null
  media: ReelMedia
  /** PCM16 WAV (Google TTS LINEAR16 or any PCM16 WAV). */
  voiceWav: Buffer
}

export type ReelResult = { mp4: Buffer; seconds: number; timeline: ReelTimeline }

const BG = '#0b0e16'
const RED = '#e31c34'
const WHITE = '#ffffff'
const MUTED = '#bac0cc'
const CARD = { x: 40, y: 150, w: REEL_W - 80, h: 860, r: 36 }
const FONT_XB = 'NaHaberInterXB'
const FONT_MD = 'NaHaberInterMD'
const HEAD_SIZE = 74
const HEAD_LH = 88

let fontsReady = false
function ensureFonts(root: string): void {
  if (fontsReady) return
  const dir = path.join(root, 'src/lib/reels/assets/fonts')
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-ExtraBold.ttf'), FONT_XB)
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-Medium.ttf'), FONT_MD)
  fontsReady = true
}

export async function resolveFfmpegPath(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  const mod = (await import('ffmpeg-static')) as unknown as { default?: string | null } | string
  const p = typeof mod === 'string' ? mod : mod.default
  if (!p) throw new Error('reels: ffmpeg binary not found (ffmpeg-static)')
  return p
}

function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** drawImage with object-fit: cover + zoom/pan. */
function drawCover(
  ctx: SKRSContext2D,
  img: Image | Canvas,
  dx: number, dy: number, dw: number, dh: number,
  zoom = 1, panX = 0.5, panY = 0.5,
): void {
  const iw = img.width
  const ih = img.height
  const s = Math.max(dw / iw, dh / ih) * zoom
  const sw = dw / s
  const sh = dh / s
  const sx = (iw - sw) * panX
  const sy = (ih - sh) * panY
  ctx.drawImage(img as Image, sx, sy, sw, sh, dx, dy, dw, dh)
}

function mixColor(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * k))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function brand(ctx: SKRSContext2D, x: number, y: number, size: number): void {
  ctx.font = `${size}px ${FONT_XB}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = WHITE
  ctx.fillText('Na', x, y)
  ctx.fillStyle = RED
  ctx.fillText('Haber', x + ctx.measureText('Na').width, y)
}

function brandWidth(ctx: SKRSContext2D, size: number): number {
  ctx.font = `${size}px ${FONT_XB}`
  return ctx.measureText('NaHaber').width
}

/** Decode the story video into card-sized RGBA frames (looped when short). */
async function* videoFrames(ffmpeg: string, file: string, n: number, w: number, h: number): AsyncGenerator<Uint8Array> {
  const proc = spawn(ffmpeg, [
    '-v', 'error', '-stream_loop', '-1', '-i', file, '-t', (n / REEL_FPS).toFixed(3),
    '-vf', `fps=${REEL_FPS},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ], { stdio: ['ignore', 'pipe', 'inherit'] })
  const size = w * h * 4
  let pending: Buffer = Buffer.alloc(0)
  for await (const chunk of proc.stdout as AsyncIterable<Buffer>) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
    while (pending.length >= size) {
      yield pending.subarray(0, size)
      pending = pending.subarray(size)
    }
  }
}

function writeFrame(stdin: NodeJS.WritableStream, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (stdin.write(data)) return resolve()
    const onDrain = () => { stdin.off('error', onError); resolve() }
    const onError = (err: Error) => { stdin.off('drain', onDrain); reject(err) }
    stdin.once('drain', onDrain)
    stdin.once('error', onError)
  })
}

export async function renderReel(input: ReelInput, opts: { root?: string } = {}): Promise<ReelResult> {
  const root = opts.root ?? process.cwd()
  ensureFonts(root)
  const ffmpeg = await resolveFfmpegPath()
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-'))
  try {
    const voiceSec = wavSeconds(input.voiceWav)

    // ---- text layout (measure once)
    const measureCanvas = createCanvas(10, 10)
    const mctx = measureCanvas.getContext('2d')
    mctx.font = `${HEAD_SIZE}px ${FONT_XB}`
    const headLines = wrapLines((s) => mctx.measureText(s).width, input.headline, REEL_W - 120, 4)
    mctx.font = `40px ${FONT_MD}`
    const sumLines = wrapLines((s) => mctx.measureText(s).width, input.summary, REEL_W - 120, 3)
    const headText = headLines.join('\n')
    const tl = buildTimeline(voiceSec, headText.length)

    // ---- audio stems
    const audioDir = path.join(root, 'src/lib/reels/assets/audio')
    const load = async (f: string) => readWav(await fs.readFile(path.join(audioDir, f)))
    const fx = buildFxTrack(
      {
        intro: await load('intro.wav'),
        outro: await load('outro.wav'),
        click: await load('click.wav'),
        whooshUp: await load('whoosh-up.wav'),
        whooshDown: await load('whoosh-down.wav'),
      },
      tl,
      clickTimes(headText, tl.typeStart),
    )
    const voicePath = path.join(work, 'voice.wav')
    const fxPath = path.join(work, 'fx.wav')
    const outPath = path.join(work, 'reel.mp4')
    await fs.writeFile(voicePath, input.voiceWav)
    await fs.writeFile(fxPath, writeWav(fx))

    // ---- media
    let image: Image | null = null
    const backdrop = createCanvas(REEL_W, REEL_H)
    if (input.media.kind === 'image') image = await loadImage(input.media.data)
    let vidIter: AsyncGenerator<Uint8Array> | null = null
    let firstVid: Uint8Array | null = null
    if (input.media.kind === 'video') {
      vidIter = videoFrames(ffmpeg, input.media.path, tl.frames, CARD.w, CARD.h)
      const first = await vidIter.next()
      firstVid = first.done ? null : Uint8Array.from(first.value)
    }
    {
      // blurred, darkened backdrop: tiny draw + upscale ≈ heavy blur
      const bctx = backdrop.getContext('2d')
      bctx.fillStyle = BG
      bctx.fillRect(0, 0, REEL_W, REEL_H)
      const src = image ?? (firstVid ? (() => {
        const c = createCanvas(CARD.w, CARD.h)
        const ictx = c.getContext('2d')
        const id = ictx.createImageData(CARD.w, CARD.h)
        id.data.set(firstVid)
        ictx.putImageData(id, 0, 0)
        return c
      })() : null)
      if (src) {
        const tiny = createCanvas(27, 48)
        drawCover(tiny.getContext('2d'), src, 0, 0, 27, 48)
        bctx.imageSmoothingEnabled = true
        bctx.imageSmoothingQuality = 'high'
        bctx.drawImage(tiny, 0, 0, REEL_W, REEL_H)
        bctx.fillStyle = 'rgba(11,14,22,0.72)'
        bctx.fillRect(0, 0, REEL_W, REEL_H)
      } else {
        const g = bctx.createLinearGradient(0, 0, 0, REEL_H)
        g.addColorStop(0, '#1a1f2e')
        g.addColorStop(1, BG)
        bctx.fillStyle = g
        bctx.fillRect(0, 0, REEL_W, REEL_H)
      }
    }

    // ---- encoder
    const enc = spawn(ffmpeg, [
      '-v', 'error', '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${REEL_W}x${REEL_H}`, '-r', String(REEL_FPS), '-i', '-',
      '-i', voicePath,
      '-stream_loop', '-1', '-i', path.join(audioDir, 'bed.wav'),
      '-i', fxPath,
      '-filter_complex', audioFilterGraph(tl.voiceStart),
      '-map', '0:v', '-map', '[a]', '-t', tl.total.toFixed(3),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outPath,
    ], { stdio: ['pipe', 'ignore', 'pipe'] })
    enc.stdin!.on('error', () => {})
    let encErr = ''
    enc.stderr!.on('data', (d) => { encErr += String(d) })
    const done = new Promise<number>((resolve) => enc.on('close', (code) => resolve(code ?? 1)))

    const canvas = createCanvas(REEL_W, REEL_H)
    const ctx = canvas.getContext('2d')
    const cardCanvas = createCanvas(CARD.w, CARD.h)
    const cctx = cardCanvas.getContext('2d')
    const cardImageData = cctx.createImageData(CARD.w, CARD.h)
    let lastVid = firstVid

    for (let i = 0; i < tl.frames; i++) {
      const t = i / REEL_FPS
      const p = t / tl.total
      ctx.drawImage(backdrop, 0, 0)

      // media card
      if (input.media.kind !== 'none') {
        ctx.save()
        roundRectPath(ctx, CARD.x, CARD.y, CARD.w, CARD.h, CARD.r)
        ctx.clip()
        if (image) {
          drawCover(ctx, image, CARD.x, CARD.y, CARD.w, CARD.h, 1 + 0.1 * p, 0.5 + 0.06 * p, 0.5)
        } else if (vidIter) {
          if (i > 0) {
            const nx = await vidIter.next()
            if (!nx.done) lastVid = nx.value
          }
          if (lastVid) {
            cardImageData.data.set(lastVid)
            cctx.putImageData(cardImageData, 0, 0)
            ctx.drawImage(cardCanvas, CARD.x, CARD.y)
          }
        }
        ctx.restore()
      } else {
        // no licensed media: brand panel with the category word
        ctx.save()
        roundRectPath(ctx, CARD.x, CARD.y, CARD.w, CARD.h, CARD.r)
        const g = ctx.createLinearGradient(CARD.x, CARD.y, CARD.x + CARD.w, CARD.y + CARD.h)
        g.addColorStop(0, '#1f2638')
        g.addColorStop(1, '#3a0d16')
        ctx.fillStyle = g
        ctx.fill()
        ctx.restore()
        ctx.font = `120px ${FONT_XB}`
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.textBaseline = 'middle'
        const word = input.category.toLocaleUpperCase('tr-TR')
        ctx.fillText(word, CARD.x + 60 - 40 * p, CARD.y + CARD.h / 2)
      }

      // top bar
      brand(ctx, 60, 62, 54)
      if (input.place) {
        const label = input.place.toLocaleUpperCase('tr-TR')
        ctx.font = `30px ${FONT_XB}`
        const pw = ctx.measureText(label).width
        ctx.strokeStyle = WHITE
        ctx.lineWidth = 3
        roundRectPath(ctx, REEL_W - 60 - pw - 36, 68, pw + 36, 50, 25)
        ctx.stroke()
        ctx.fillStyle = WHITE
        ctx.textBaseline = 'top'
        ctx.fillText(label, REEL_W - 60 - pw - 18, 78)
      }

      // category chip
      const chipY = CARD.y + CARD.h + 46
      const cat = input.category.toLocaleUpperCase('tr-TR')
      ctx.font = `30px ${FONT_XB}`
      const cw = ctx.measureText(cat).width
      ctx.fillStyle = RED
      roundRectPath(ctx, 60, chipY, cw + 40, 52, 12)
      ctx.fill()
      ctx.fillStyle = WHITE
      ctx.textBaseline = 'top'
      ctx.fillText(cat, 80, chipY + 10)

      // typewriter headline
      const headY = CARD.y + CARD.h + 128
      const shown = Math.max(0, Math.min(headText.length, Math.floor((t - tl.typeStart) * TYPE_CPS)))
      const typed = headText.slice(0, shown).split('\n')
      ctx.font = `${HEAD_SIZE}px ${FONT_XB}`
      ctx.fillStyle = WHITE
      typed.forEach((line, k) => ctx.fillText(line, 60, headY + k * HEAD_LH))
      const caretOn = shown < headText.length || (Math.floor(t * 2) % 2 === 0 && t < tl.summaryStart + 1)
      if (caretOn && t >= tl.typeStart - 0.2) {
        const last = typed[typed.length - 1] ?? ''
        const cx = 60 + ctx.measureText(last).width + 6
        const cy = headY + HEAD_LH * (typed.length - 1)
        ctx.fillStyle = RED
        ctx.fillRect(cx, cy + 10, 8, 72)
      }

      // summary + CTA
      if (t >= tl.summaryStart) {
        const k = ease((t - tl.summaryStart) / 0.5)
        let sy = headY + HEAD_LH * headLines.length + 36 + Math.round(30 * (1 - k))
        ctx.font = `40px ${FONT_MD}`
        ctx.fillStyle = mixColor(BG, MUTED, k)
        for (const line of sumLines) {
          ctx.fillText(line, 60, sy)
          sy += 54
        }
        const kc = ease((t - tl.summaryStart - 0.3) / 0.5)
        const cta = 'Haberin tamamı nahaber.com’da'
        const ctaW = ctx.measureText(cta).width
        const bx = (REEL_W - ctaW) / 2 - 44
        ctx.fillStyle = mixColor(BG, WHITE, kc)
        roundRectPath(ctx, bx, 1772, ctaW + 88, 84, 42)
        ctx.fill()
        ctx.fillStyle = BG
        ctx.fillText(cta, bx + 44, 1790)
      }

      // end card
      if (t >= tl.endStart) {
        const k = ease((t - tl.endStart) / 0.45)
        ctx.globalAlpha = k
        ctx.fillStyle = BG
        ctx.fillRect(0, 0, REEL_W, REEL_H)
        const bw = brandWidth(ctx, 120)
        brand(ctx, (REEL_W - bw) / 2, 760, 120)
        ctx.font = `38px ${FONT_XB}`
        ctx.fillStyle = MUTED
        const msg = 'Haberin tamamı'
        ctx.fillText(msg, (REEL_W - ctx.measureText(msg).width) / 2, 940)
        const url = 'nahaber.com'
        const uw = ctx.measureText(url).width
        ctx.fillStyle = WHITE
        roundRectPath(ctx, (REEL_W - uw) / 2 - 40, 1010, uw + 80, 80, 40)
        ctx.fill()
        ctx.fillStyle = BG
        ctx.fillText(url, (REEL_W - uw) / 2, 1030)
        ctx.globalAlpha = 1
      }

      try {
        await writeFrame(enc.stdin!, canvas.data())
      } catch (err) {
        const c = await done
        throw new Error(`reels: ffmpeg stopped (${c}): ${encErr.slice(-400) || (err as Error).message}`)
      }
    }
    enc.stdin!.end()
    const code = await done
    if (code !== 0) throw new Error(`reels: ffmpeg failed (${code}): ${encErr.slice(-400)}`)
    const mp4 = await fs.readFile(outPath)
    return { mp4, seconds: tl.total, timeline: tl }
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
