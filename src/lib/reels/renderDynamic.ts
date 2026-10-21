import 'server-only'

/**
 * REELS-7 — «Dinamik» reel (default), modelled on the editor's reference video:
 *  • the story's photo / video full screen, dark fade at the bottom, logo block top-left;
 *  • kicker (category │ HABER) + rule, big UPPERCASE headline — all left-aligned;
 *  • the headline gives way to the summary half-way through the voice-over;
 *  • when the story has its own video with REAL sound (a non-silent audio track), the video
 *    keeps playing with that sound after the voice-over (music fades out), up to 25 s;
 *    a silent or sound-less video ends with the voice-over — no sound is ever added;
 *  • black / red end card: logo block, «Haberin tamamı» box + red nahaber.com pill.
 * Text stays inside the Instagram safe zone (above the caption area).
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas, loadImage, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { REEL_FPS, REEL_H, REEL_W, wrapLines, type ReelTimeline } from './timeline'
import { buildFxTrack, dynamicAudioGraph, readWav, wavSeconds, writeWav } from './audio'
import {
  FONT_MD, FONT_XB, RED, SAFE, STYLE_ACCENT, WHITE,
  audioDir, bedPath, brandBackground, clamp01, drawCover, ensureFonts, loadBrand, newCanvas,
  resolveFfmpegPath, resolveMusic, roundRectPath, span, videoFrames, wordmark, wordmarkWidth,
  type Brand, type ReelOutro, type ReelStyle,
} from './reelTheme'
import type { ReelInput, ReelResult } from './renderReel'
import { summaryOptions } from './headlineCard'

/** REELS-9: text is never cut — the size steps down until the whole headline fits. */
const HEAD_SIZES = [76, 68, 60, 54, 48, 44]
const HEAD_MAX_LINES = 5
const SUM_SIZES = [42, 38, 34]
const SUM_MAX_LINES = 6
const SLIDE_MIN_S = 2.4
const SLIDE_FADE_S = 0.5
const TEXT_X = SAFE.x
/** Left-aligned text, clear of the Instagram action column on the right. */
const TEXT_W = REEL_W - TEXT_X - SAFE.right
const TEXT_BOTTOM = SAFE.bottom - 10
/** REELS-11: the story video's own sound after the voice-over, capped (was 25 s → render timeouts). */
const VIDEO_AUDIO_MAX_S = 12
const END_S = 2.8

/** Duration + audio presence of a local file or URL (ffmpeg -i banner). */
export async function probeMedia(ffmpeg: string, src: string): Promise<{ duration: number; hasAudio: boolean }> {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-i', src], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    const timer = setTimeout(() => p.kill('SIGKILL'), 20_000)
    p.stderr!.on('data', (d) => { err += String(d) })
    p.on('close', () => {
      clearTimeout(timer)
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      const duration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0
      resolve({ duration, hasAudio: /Stream #\d+:\d+.*Audio:/.test(err) })
    })
    p.on('error', () => { clearTimeout(timer); resolve({ duration: 0, hasAudio: false }) })
  })
}

/**
 * Peak level (dBFS) of the media's own audio in [start, start+dur]; -Infinity when
 * there is no audio / it cannot be read. Used so a silent track is never presented as
 * «the video's sound» (no sound is ever invented).
 */
export async function audioPeakDb(ffmpeg: string, src: string, start: number, dur: number): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-ss', start.toFixed(2), '-t', dur.toFixed(2), '-i', src, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    const timer = setTimeout(() => p.kill('SIGKILL'), 30_000)
    p.stderr!.on('data', (d) => { err += String(d) })
    p.on('close', () => {
      clearTimeout(timer)
      const m = err.match(/max_volume:\s*(-?[\d.]+|-inf) dB/)
      resolve(m && m[1] !== '-inf' ? Number(m[1]) : -Infinity)
    })
    p.on('error', () => { clearTimeout(timer); resolve(-Infinity) })
  })
}

/**
 * NaHaber logo on the picture: the transparent mark (white N + red bubble) and the
 * «Na»(white)«Haber»(red) wordmark — no box or fill behind it, only a soft shadow.
 */
function logoBlock(ctx: SKRSContext2D, brand: Brand, x: number, y: number, scale = 1): void {
  const size = Math.round(92 * scale)
  const ws = Math.round(54 * scale)
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 14 * scale
  ctx.shadowOffsetY = 2 * scale
  ctx.drawImage(brand.mark, x, y, size, size)
  wordmark(ctx, x + size + 10 * scale, y + (size - ws) / 2 - 2 * scale, ws)
  ctx.restore()
}

/** Width of logoBlock at a scale (for centring). */
function logoWidth(ctx: SKRSContext2D, scale = 1): number {
  return Math.round(92 * scale) + 10 * scale + wordmarkWidth(ctx, Math.round(54 * scale))
}

/** «CATEGORY │ HABER» kicker at the left margin with a thin rule after it. */
function kicker(ctx: SKRSContext2D, left: string, right: string, rightColor: string, cy: number, k: number): void {
  ctx.font = `34px ${FONT_XB}`
  const pad = 20
  const lw = ctx.measureText(left).width + pad * 2
  const rw = ctx.measureText(right).width + pad * 2
  const h = 58
  const x = TEXT_X
  const y = cy - h / 2
  // rule after the kicker
  const rule = Math.max(0, REEL_W - SAFE.right - (x + lw + rw + 16)) * k
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillRect(x + lw + rw + 16, cy - 1.5, rule, 3)
  ctx.save()
  ctx.globalAlpha *= k
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(x, y, lw, h)
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 3
  ctx.strokeRect(x + 1.5, y + 1.5, lw - 3, h - 3)
  ctx.fillStyle = rightColor
  ctx.fillRect(x + lw, y, rw, h)
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  ctx.fillText(left, x + pad, cy + 2)
  ctx.fillText(right, x + lw + pad, cy + 2)
  ctx.restore()
}

/**
 * REELS-9 photo: an upright photo fills the frame; a landscape photo is shown whole
 * (full width, gentle zoom) over a blurred, darkened copy of itself — never cropped to a strip.
 */
type Slide = { img: Image; blur: Canvas | null }
function makeSlide(img: Image): Slide {
  if (img.height >= img.width * 1.25) return { img, blur: null }
  const small = createCanvas(54, 96)
  drawCover(small.getContext('2d'), img, 0, 0, 54, 96, 1.15, 0.5, 0.5)
  const big = createCanvas(REEL_W, REEL_H)
  const b = big.getContext('2d')
  b.imageSmoothingQuality = 'high'
  b.drawImage(small, 0, 0, REEL_W, REEL_H)
  b.fillStyle = 'rgba(0,0,0,0.45)'
  b.fillRect(0, 0, REEL_W, REEL_H)
  return { img, blur: big }
}
function drawSlide(ctx: SKRSContext2D, s: Slide, k: number): void {
  if (!s.blur) {
    drawCover(ctx, s.img, 0, 0, REEL_W, REEL_H, 1.04 + 0.08 * k, 0.5, 0.45)
    return
  }
  ctx.drawImage(s.blur, 0, 0)
  const z = 1 + 0.06 * k
  const w = REEL_W * z
  const h = Math.min(REEL_H * 0.62, (w * s.img.height) / s.img.width)
  const dw = Math.min(w, (h * s.img.width) / s.img.height)
  // centre of the photo above the text block, below the logo
  const cy = REEL_H * 0.4
  ctx.drawImage(s.img, (REEL_W - dw) / 2, cy - h / 2, dw, h)
}

function leftLines(ctx: SKRSContext2D, lines: string[], y0: number, lh: number, a: number[], rise = 26): void {
  lines.forEach((l, i) => {
    const k = a[i] ?? 1
    if (k <= 0) return
    ctx.save()
    ctx.globalAlpha *= k
    ctx.fillText(l, TEXT_X, y0 + i * lh + rise * (1 - k))
    ctx.restore()
  })
}

/**
 * End card over the still-playing picture: a see-through NaHaber navy veil fades in, the
 * logo + «Haberin tamamı» / nahaber.com appear, and the whole frame fades out into the
 * theme navy at the very end. No coloured stripes.
 */
function endCard(ctx: SKRSContext2D, brand: Brand, et: number, outro: ReelOutro): void {
  if (et < 0) return
  const k = span(et, 0, 0.5)
  ctx.save()
  ctx.fillStyle = `rgba(7,21,48,${0.72 * k})`
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  ctx.globalAlpha *= k
  const cy = 820
  const lk = span(et, 0.15, 0.6)
  ctx.globalAlpha *= lk
  logoBlock(ctx, brand, (REEL_W - logoWidth(ctx, 1.2)) / 2, cy - 240, 1.2)
  // «Haberin tamamı» box + red pill
  ctx.font = `46px ${FONT_XB}`
  const cta = 'Haberin tamamı'
  const bw = 640
  ctx.fillStyle = 'rgba(7,21,48,0.55)'
  ctx.fillRect((REEL_W - bw) / 2, cy - 40, bw, 170)
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 3
  ctx.strokeRect((REEL_W - bw) / 2, cy - 40, bw, 170)
  ctx.fillStyle = RED
  ctx.fillRect((REEL_W - bw) / 2, cy - 40, 230, 5)
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'top'
  ctx.fillText(cta, (REEL_W - ctx.measureText(cta).width) / 2, cy - 10)
  ctx.font = `40px ${FONT_XB}`
  const url = 'nahaber.com'
  const uw = ctx.measureText(url).width + 70
  ctx.fillStyle = RED
  ctx.fillRect((REEL_W - uw) / 2, cy + 64, uw, 76)
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 2
  ctx.strokeRect((REEL_W - uw) / 2 + 1, cy + 65, uw - 2, 74)
  ctx.fillStyle = WHITE
  ctx.fillText(url, (REEL_W - ctx.measureText(url).width) / 2, cy + 80)
  if (outro !== 'short') {
    ctx.font = `34px ${FONT_MD}`
    const rows = outro === 'follow' ? ['Takip et  @nahaber_com', 'www.nahaber.com'] : ['@nahaber_com', 'www.nahaber.com']
    rows.forEach((r, i) => {
      const y = cy + 220 + i * 62
      ctx.fillStyle = RED
      ctx.beginPath()
      ctx.arc(REEL_W / 2 - 230, y + 18, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = WHITE
      ctx.fillText(r, REEL_W / 2 - 196, y)
    })
    ctx.fillStyle = WHITE
    ctx.fillRect(REEL_W / 2 - 250, cy + 360, 340, 4)
    ctx.fillStyle = RED
    ctx.fillRect(REEL_W / 2 + 90, cy + 360, 160, 4)
  }
  ctx.restore()
  // fade out into the theme navy over the last 0.6 s
  const fo = span(et, END_S - 0.6, END_S)
  if (fo > 0) {
    ctx.fillStyle = `rgba(7,21,48,${fo})`
    ctx.fillRect(0, 0, REEL_W, REEL_H)
  }
}

function spawnDynamicEncoder(ffmpeg: string, a: { voice: string; bed: string | null; fx: string; media: string | null; filter: string; total: number; out: string }) {
  const enc = spawn(ffmpeg, [
    '-v', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${REEL_W}x${REEL_H}`, '-r', String(REEL_FPS), '-i', '-',
    '-i', a.voice,
    ...(a.bed ? ['-stream_loop', '-1', '-i', a.bed] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono']),
    '-i', a.fx,
    ...(a.media ? ['-vn', '-i', a.media] : []),
    '-filter_complex', a.filter,
    '-map', '0:v', '-map', '[a]', '-t', a.total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', a.out,
  ], { stdio: ['pipe', 'ignore', 'pipe'] })
  enc.stdin!.on('error', () => {})
  let err = ''
  enc.stderr!.on('data', (x) => { err += String(x) })
  const done = new Promise<number>((resolve) => enc.on('close', (code) => resolve(code ?? 1)))
  return {
    frame(data: Uint8ClampedArray | Buffer): Promise<void> {
      return new Promise((resolve, reject) => {
        if (enc.stdin!.write(data)) return resolve()
        const onDrain = () => { enc.stdin!.off('error', onErr); resolve() }
        const onErr = (e: Error) => { enc.stdin!.off('drain', onDrain); done.then((c) => reject(new Error(`reels: ffmpeg stopped (${c}): ${err.slice(-400) || e.message}`))) }
        enc.stdin!.once('drain', onDrain)
        enc.stdin!.once('error', onErr)
      })
    },
    async finish() {
      enc.stdin!.end()
      const code = await done
      if (code !== 0) throw new Error(`reels: ffmpeg failed (${code}): ${err.slice(-400)}`)
    },
  }
}

export async function renderDynamic(input: ReelInput, opts: { root?: string } = {}): Promise<ReelResult> {
  const root = opts.root ?? process.cwd()
  ensureFonts(root)
  const ffmpeg = await resolveFfmpegPath()
  const style: ReelStyle = input.style ?? 'haber'
  const outro: ReelOutro = input.outro ?? 'logo'
  const music = resolveMusic(input.music, style, input.breaking)
  const accent = input.breaking ? RED : STYLE_ACCENT[style]
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'reeld-'))
  try {
    const voiceSec = wavSeconds(input.voiceWav)
    const voiceStart = 0.45
    const voiceEnd = voiceStart + voiceSec
    // the story's own video sound after the voice-over
    let videoAudio = false
    let videoTail = 0
    if (input.media.kind === 'video') {
      const pm = await probeMedia(ffmpeg, input.media.path)
      // only real sound: an audio stream that is not silent after the voice-over
      if (pm.hasAudio && pm.duration - voiceEnd >= 2) {
        const tail = Math.min(VIDEO_AUDIO_MAX_S, pm.duration - voiceEnd - 0.15)
        if ((await audioPeakDb(ffmpeg, input.media.path, voiceEnd, tail)) > -40) {
          videoAudio = true
          videoTail = tail
        }
      }
    }
    const endStart = voiceEnd + 0.45 + videoTail
    const total = endStart + END_S
    const frames = Math.ceil(total * REEL_FPS)
    const sumAt = voiceStart + Math.max(2.8, voiceSec * 0.45)
    const textOut = videoAudio ? voiceEnd + 0.35 : endStart
    const tl: ReelTimeline = { total, frames, voiceStart, typeStart: 0.3, typeEnd: 0.9, summaryStart: sumAt, endStart }

    // layout
    const m = createCanvas(10, 10).getContext('2d')
    const upper = input.headline.toLocaleUpperCase('tr-TR')
    let HEAD = HEAD_SIZES[0]!
    let head: string[] = []
    for (const size of HEAD_SIZES) {
      HEAD = size
      m.font = `${size}px ${FONT_XB}`
      head = wrapLines((s) => m.measureText(s).width, upper, TEXT_W)
      if (head.length <= HEAD_MAX_LINES) break
    }
    // REELS-9: never «…» — at the smallest size every line of the headline is kept.
    const HEAD_LH = Math.round(HEAD * 1.13)
    // summary: as many whole sentences as fit, largest size first (never cut mid-sentence)
    let SUM = SUM_SIZES[0]!
    let sum: string[] = []
    pick: for (const opt of summaryOptions(input.summary || input.headline)) {
      for (const size of SUM_SIZES) {
        m.font = `${size}px ${FONT_MD}`
        const lines = wrapLines((s) => m.measureText(s).width, opt, TEXT_W)
        if (lines.length <= SUM_MAX_LINES) {
          SUM = size
          sum = lines
          break pick
        }
      }
    }
    const SUM_LH = Math.round(SUM * 1.38)
    const headY = TEXT_BOTTOM - head.length * HEAD_LH
    const kickY = headY - 62
    const sumY = TEXT_BOTTOM - sum.length * SUM_LH
    const ruleY = sumY - 34
    const cat = input.category.toLocaleUpperCase('tr-TR')
    const right = input.breaking ? 'SON DAKİKA' : 'HABER'

    // audio
    const adir = audioDir(root)
    const load = async (f: string) => readWav(await fs.readFile(path.join(adir, f)))
    // no intro sting / whoosh at the start (editor's call) — the voice opens the reel
    const outroClip = await load(outro === 'follow' ? 'outro-follow.wav' : outro === 'short' ? 'outro-short.wav' : 'outro-soft.wav')
    const silent = { sampleRate: outroClip.sampleRate, data: new Float32Array(0) }
    const fx = buildFxTrack(
      {
        intro: silent,
        outro: await load(outro === 'follow' ? 'outro-follow.wav' : outro === 'short' ? 'outro-short.wav' : 'outro-soft.wav'),
        click: await load('click.wav'),
        whooshUp: await load('whoosh-up.wav'),
        whooshDown: await load('whoosh-down.wav'),
      },
      { total, summaryStart: sumAt, endStart },
      [],
      [],
    )
    const voicePath = path.join(work, 'voice.wav')
    const fxPath = path.join(work, 'fx.wav')
    const outPath = path.join(work, 'reel.mp4')
    await fs.writeFile(voicePath, input.voiceWav)
    await fs.writeFile(fxPath, writeWav(fx))
    const enc = spawnDynamicEncoder(ffmpeg, {
      voice: voicePath,
      bed: bedPath(root, music),
      fx: fxPath,
      media: videoAudio && input.media.kind === 'video' ? input.media.path : null,
      filter: dynamicAudioGraph({ voiceStart, voiceEnd, bedVolume: music ? 0.9 : 0, videoAudio }),
      total,
      out: outPath,
    })

    const brand = await loadBrand(root)
    // REELS-9: every photo of the story, shown in turn with a soft cross-fade
    const slides: Slide[] = []
    if (input.media.kind === 'image') {
      for (const buf of [input.media.data, ...(input.media.more ?? [])]) {
        const img = await loadImage(buf).catch(() => null)
        if (img && img.width > 0 && img.height > 0) slides.push(makeSlide(img))
      }
    }
    const nSlides = Math.max(1, Math.min(slides.length, Math.floor(endStart / SLIDE_MIN_S) || 1))
    const slideLen = endStart / nSlides
    const vid = input.media.kind === 'video' ? videoFrames(ffmpeg, input.media.path, frames, REEL_W, REEL_H) : null
    const vidCanvas = createCanvas(REEL_W, REEL_H)
    const vctx = vidCanvas.getContext('2d')
    const vidData = vctx.createImageData(REEL_W, REEL_H)
    let haveVid = false
    const { canvas, ctx } = newCanvas()

    for (let i = 0; i < frames; i++) {
      const t = i / REEL_FPS
      const p = clamp01(t / Math.max(1, endStart))
      if (vid) {
        const nx = await vid.next()
        if (!nx.done) {
          vidData.data.set(nx.value)
          vctx.putImageData(vidData, 0, 0)
          haveVid = true
        }
      }
      if (haveVid) ctx.drawImage(vidCanvas, 0, 0)
      else if (slides.length) {
        const idx = Math.min(nSlides - 1, Math.floor(Math.min(t, endStart - 0.001) / slideLen))
        const local = clamp01((t - idx * slideLen) / slideLen)
        drawSlide(ctx, slides[idx]!, local)
        // cross-fade into the next photo
        const fadeIn = idx + 1 < nSlides ? span(t, (idx + 1) * slideLen - SLIDE_FADE_S, (idx + 1) * slideLen) : 0
        if (fadeIn > 0) {
          ctx.save()
          ctx.globalAlpha *= fadeIn
          drawSlide(ctx, slides[idx + 1]!, 0)
          ctx.restore()
        }
      }
      else brandBackground(ctx, brand, t, p, accent, input.category)

      // bottom fade (lighter while the story's own video plays with sound)
      const textK = 1 - span(t, textOut, textOut + 0.5)
      const g = ctx.createLinearGradient(0, REEL_H * 0.42, 0, REEL_H)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.45, `rgba(0,0,0,${0.35 + 0.35 * textK})`)
      g.addColorStop(1, `rgba(0,0,0,${0.55 + 0.35 * textK})`)
      ctx.fillStyle = g
      ctx.fillRect(0, REEL_H * 0.42, REEL_W, REEL_H * 0.58)
      const gt = ctx.createLinearGradient(0, 0, 0, SAFE.top + 160)
      gt.addColorStop(0, 'rgba(0,0,0,0.45)')
      gt.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gt
      ctx.fillRect(0, 0, REEL_W, SAFE.top + 160)

      // logo block top-left
      const lk = span(t, 0.05, 0.45) * (1 - span(t, endStart, endStart + 0.4))
      ctx.save()
      ctx.globalAlpha *= lk
      ctx.translate(-40 * (1 - lk), 0)
      logoBlock(ctx, brand, SAFE.x, SAFE.top)
      ctx.restore()

      if (textK > 0) {
        ctx.save()
        ctx.globalAlpha *= textK
        // phase 1: kicker + headline
        const hOut = 1 - span(t, sumAt - 0.25, sumAt + 0.15)
        if (hOut > 0) {
          ctx.save()
          ctx.globalAlpha *= hOut
          kicker(ctx, cat, right, accent, kickY, span(t, 0.25, 0.75))
          ctx.font = `${HEAD}px ${FONT_XB}`
          ctx.fillStyle = WHITE
          ctx.textBaseline = 'top'
          ctx.shadowColor = 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = 16
          leftLines(ctx, head, headY, HEAD_LH, head.map((_, k) => span(t, 0.45 + k * 0.14, 0.85 + k * 0.14)))
          ctx.restore()
        }
        // phase 2: rule + summary
        const sk = span(t, sumAt, sumAt + 0.5)
        if (sk > 0) {
          const rw = 520 * sk
          ctx.fillStyle = RED
          ctx.fillRect(TEXT_X, ruleY, Math.min(rw, 160), 5)
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.fillRect(TEXT_X + 160, ruleY + 1, Math.max(0, rw - 160), 3)
          ctx.font = `${SUM}px ${FONT_MD}`
          ctx.fillStyle = WHITE
          ctx.textBaseline = 'top'
          ctx.shadowColor = 'rgba(0,0,0,0.5)'
          ctx.shadowBlur = 12
          leftLines(ctx, sum, sumY, SUM_LH, sum.map((_, k) => span(t, sumAt + 0.1 + k * 0.08, sumAt + 0.5 + k * 0.08)), 18)
        }
        ctx.restore()
      }
      // the story's own sound: small label
      if (videoAudio && t >= textOut && t < endStart) {
        const k = span(t, textOut + 0.2, textOut + 0.6) * (1 - span(t, endStart - 0.3, endStart))
        ctx.save()
        ctx.globalAlpha *= k
        ctx.font = `30px ${FONT_XB}`
        const lbl = 'HABERİN VİDEOSU'
        const w = ctx.measureText(lbl).width + 76
        ctx.fillStyle = RED
        roundRectPath(ctx, SAFE.x, SAFE.bottom - 70, w, 60, 8)
        ctx.fill()
        ctx.fillStyle = WHITE
        // speaker glyph
        ctx.beginPath()
        ctx.moveTo(SAFE.x + 18, SAFE.bottom - 48)
        ctx.lineTo(SAFE.x + 28, SAFE.bottom - 48)
        ctx.lineTo(SAFE.x + 40, SAFE.bottom - 58)
        ctx.lineTo(SAFE.x + 40, SAFE.bottom - 22)
        ctx.lineTo(SAFE.x + 28, SAFE.bottom - 32)
        ctx.lineTo(SAFE.x + 18, SAFE.bottom - 32)
        ctx.closePath()
        ctx.fill()
        ctx.textBaseline = 'middle'
        ctx.fillText(lbl, SAFE.x + 56, SAFE.bottom - 39)
        ctx.restore()
      }
      // progress (thin, top)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.fillRect(0, 0, REEL_W, 6)
      ctx.fillStyle = RED
      ctx.fillRect(0, 0, REEL_W * clamp01(t / endStart), 6)

      endCard(ctx, brand, t - endStart, outro)
      await enc.frame(canvas.data())
    }
    await enc.finish()
    return { mp4: await fs.readFile(outPath), seconds: total, timeline: tl }
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

