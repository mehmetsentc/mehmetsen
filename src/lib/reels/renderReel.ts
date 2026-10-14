import 'server-only'

/**
 * REELS — single-story NaHaber reel (1080×1920, 30 fps, H.264 + AAC).
 * Theme: ./reelTheme (navy + red + white, the app logo). Intro variant, theme
 * music and story style are inputs (the Reels AI editor / studio pick them).
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas'
import { REEL_FPS, REEL_H, REEL_W, TYPE_CPS, buildTimeline, clickTimes, wrapLines, type ReelTimeline } from './timeline'
import { audioFilterGraph, buildFxTrack, readWav, wavSeconds, writeWav } from './audio'
import {
  FONT_MD, FONT_XB, INTRO_SECONDS, MUTED, OUTRO_SECONDS, RED, STYLE_ACCENT, TICKER_Y, WHITE,
  audioDir, bedPath, brandBackground, categoryTag, clamp01, drawCover, endCard, ensureFonts, header, introOverlay,
  legibility, loadBrand, newCanvas, presenterCard, progressBar, resolveFfmpegPath, resolveMusic, span, spawnEncoder,
  ticker, videoFrames, voiceEnvelope,
  type ReelIntro, type ReelMedia, type ReelMusic, type ReelOutro, type ReelPresenter, type ReelStyle,
} from './reelTheme'

export type { ReelIntro, ReelMedia, ReelMusic, ReelOutro, ReelPresenter, ReelStyle } from './reelTheme'
export { resolveFfmpegPath, STYLE_ACCENT } from './reelTheme'

export type ReelInput = {
  headline: string
  summary: string
  category: string
  place?: string | null
  media: ReelMedia
  /** PCM16 WAV (Google TTS LINEAR16 or any PCM16 WAV). */
  voiceWav: Buffer
  style?: ReelStyle
  intro?: ReelIntro
  /** Theme music; default follows the style. */
  music?: ReelMusic
  outro?: ReelOutro
  presenter?: ReelPresenter | null
  breaking?: boolean
  dateLabel?: string | null
}

export type ReelResult = { mp4: Buffer; seconds: number; timeline: ReelTimeline }

const HEAD_SIZE = 76
const HEAD_LH = 90
const SUM_SIZE = 40
const SUM_LH = 54
const TEXT_X = 84
const TEXT_W = REEL_W - TEXT_X - 64

export async function renderReel(input: ReelInput, opts: { root?: string } = {}): Promise<ReelResult> {
  const root = opts.root ?? process.cwd()
  ensureFonts(root)
  const ffmpeg = await resolveFfmpegPath()
  const style: ReelStyle = input.style ?? 'haber'
  const intro: ReelIntro = input.intro ?? 'soft'
  const outro: ReelOutro = input.outro ?? 'logo'
  const music = resolveMusic(input.music, style, input.breaking)
  const introS = INTRO_SECONDS[intro]
  const accent = input.breaking ? RED : STYLE_ACCENT[style]
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-'))
  try {
    const voiceSec = wavSeconds(input.voiceWav)

    // ---- text layout, anchored above the ticker
    const m = createCanvas(10, 10).getContext('2d')
    m.font = `${HEAD_SIZE}px ${FONT_XB}`
    const headLines = wrapLines((s) => m.measureText(s).width, input.headline, TEXT_W, 4)
    m.font = `${SUM_SIZE}px ${FONT_MD}`
    const sumLines = wrapLines((s) => m.measureText(s).width, input.summary, TEXT_W, 3)
    const headText = headLines.join('\n')
    const tl = buildTimeline(voiceSec, headText.length, introS, OUTRO_SECONDS[outro])
    const tagH = 62
    const blockH = tagH + 30 + headLines.length * HEAD_LH + (sumLines.length ? 22 + sumLines.length * SUM_LH : 0)
    const tagY = Math.min(1180, TICKER_Y - 48 - blockH)
    const headY = tagY + tagH + 30
    const sumY = headY + headLines.length * HEAD_LH + 22
    const tagIn = Math.max(0.1, tl.typeStart - 0.3)

    // ---- audio
    const adir = audioDir(root)
    const load = async (f: string) => readWav(await fs.readFile(path.join(adir, f)))
    const fx = buildFxTrack(
      {
        intro: await load(`intro-${intro}.wav`),
        outro: await load(outro === 'follow' ? 'outro-follow.wav' : outro === 'short' ? 'outro-short.wav' : 'outro-soft.wav'),
        click: await load('click.wav'),
        whooshUp: await load('whoosh-up.wav'),
        whooshDown: await load('whoosh-down.wav'),
      },
      tl,
      clickTimes(headText, tl.typeStart),
      [{ clip: 'whooshUp', at: tagIn - 0.05, gain: 0.05 }],
    )
    const voicePath = path.join(work, 'voice.wav')
    const fxPath = path.join(work, 'fx.wav')
    const outPath = path.join(work, 'reel.mp4')
    await fs.writeFile(voicePath, input.voiceWav)
    await fs.writeFile(fxPath, writeWav(fx))

    // ---- media + encoder
    const brand = await loadBrand(root)
    let image: Image | null = null
    if (input.media.kind === 'image') image = await loadImage(input.media.data)
    const presenterPhoto = input.presenter?.photo ? await loadImage(input.presenter.photo).catch(() => null) : null
    const level = input.presenter ? voiceEnvelope(readWav(input.voiceWav), tl.voiceStart, tl.frames, REEL_FPS) : null
    const vid = input.media.kind === 'video' ? videoFrames(ffmpeg, input.media.path, tl.frames) : null
    const enc = spawnEncoder(ffmpeg, {
      voice: voicePath, bed: bedPath(root, music), fx: fxPath,
      filter: audioFilterGraph(tl.voiceStart, music ? 0.9 : 0), total: tl.total, out: outPath,
    })

    const { canvas, ctx } = newCanvas()
    const vidCanvas = createCanvas(REEL_W, REEL_H)
    const vctx = vidCanvas.getContext('2d')
    const vidData = vctx.createImageData(REEL_W, REEL_H)
    let haveVid = false
    const cat = (input.breaking ? 'SON DAKİKA' : input.category).toLocaleUpperCase('tr-TR')
    const placeLabel = input.place ? input.place.toLocaleUpperCase('tr-TR') : null
    const tickerText =
      `${placeLabel ? `${placeLabel}  •  ` : ''}Haberin tamamı nahaber.com’da  •  Gündemi kaçırma, NaHaber’i takip et  •  ` +
      `${input.dateLabel ? `${input.dateLabel}  •  ` : ''}`

    for (let i = 0; i < tl.frames; i++) {
      const t = i / REEL_FPS
      const mainP = clamp01((t - introS) / Math.max(0.1, tl.endStart - introS))

      if (vid) {
        const nx = await vid.next()
        if (!nx.done) {
          vidData.data.set(nx.value)
          vctx.putImageData(vidData, 0, 0)
          haveVid = true
        }
      }
      if (image) drawCover(ctx, image, 0, 0, REEL_W, REEL_H, 1.06 + 0.1 * mainP, 0.46 + 0.08 * mainP, 0.45)
      else if (haveVid) ctx.drawImage(vidCanvas, 0, 0)
      else brandBackground(ctx, brand, t, mainP, accent, input.category)
      legibility(ctx, tagY)
      progressBar(ctx, mainP)
      header(ctx, brand, -140 + 196 * span(t, Math.max(0, introS - 0.1), introS + 0.4), placeLabel)

      categoryTag(ctx, cat, 48, tagY, tagH, accent, span(t, tagIn, tagIn + 0.45), t, input.breaking)

      // typewriter headline + red side bar
      const shown = Math.max(0, Math.min(headText.length, Math.floor((t - tl.typeStart) * TYPE_CPS)))
      const typed = headText.slice(0, shown).split('\n')
      ctx.fillStyle = RED
      ctx.fillRect(48, headY + 6, 12, (Math.max(typed.length, 1) * HEAD_LH - 14) * span(t, tagIn + 0.15, tagIn + 0.55))
      ctx.font = `${HEAD_SIZE}px ${FONT_XB}`
      ctx.fillStyle = WHITE
      ctx.textBaseline = 'top'
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = 12
      typed.forEach((line, k) => ctx.fillText(line, TEXT_X, headY + k * HEAD_LH))
      ctx.shadowBlur = 0
      const caretOn = shown < headText.length || (Math.floor(t * 2) % 2 === 0 && t < tl.summaryStart + 1)
      if (caretOn && t >= tl.typeStart - 0.2 && t < tl.endStart) {
        const cx = TEXT_X + ctx.measureText(typed[typed.length - 1] ?? '').width + 8
        ctx.fillStyle = RED
        ctx.fillRect(cx, headY + HEAD_LH * (typed.length - 1) + 8, 9, 70)
      }

      if (t >= tl.summaryStart && sumLines.length) {
        const k = span(t, tl.summaryStart, tl.summaryStart + 0.5)
        ctx.save()
        ctx.globalAlpha = k
        ctx.font = `${SUM_SIZE}px ${FONT_MD}`
        ctx.fillStyle = MUTED
        sumLines.forEach((line, n) => ctx.fillText(line, TEXT_X, sumY + n * SUM_LH + Math.round(24 * (1 - k))))
        ctx.restore()
      }

      if (input.presenter && level) {
        presenterCard(ctx, input.presenter, presenterPhoto, accent, 48, 176, level[i] ?? 0, span(t, introS + 0.1, introS + 0.5) * (1 - span(t, tl.endStart - 0.4, tl.endStart)))
      }
      ticker(ctx, brand, tickerText, t, span(t, introS, introS + 0.45))
      introOverlay(ctx, brand, intro, t)
      endCard(ctx, brand, intro, t - tl.endStart, t, 'Haberin tamamı', outro)
      await enc.frame(canvas)
    }
    await enc.finish()
    return { mp4: await fs.readFile(outPath), seconds: tl.total, timeline: tl }
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
