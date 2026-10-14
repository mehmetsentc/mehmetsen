import 'server-only'

/**
 * REELS — single-story NaHaber reel (1080×1920, 30 fps, H.264 + AAC).
 * Theme: ./reelTheme (navy + red + white, the app logo). Intro variant, theme
 * music and story style are inputs (the Reels AI editor / studio pick them).
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas, loadImage, type Canvas, type Image } from '@napi-rs/canvas'
import { REEL_FPS, REEL_H, REEL_W, TYPE_CPS, buildTimeline, clickTimes, wrapLines, type ReelTimeline } from './timeline'
import { audioFilterGraph, buildFxTrack, readWav, wavSeconds, writeWav } from './audio'
import {
  FONT_MD, FONT_XB, INTRO_SECONDS, MUTED, NAVY, OUTRO_SECONDS, RED, SAFE, STYLE_ACCENT, TICKER_H, TICKER_Y, WHITE,
  audioDir, bedPath, brandBackground, bulletinBand, categoryTag, clamp01, drawCover, endCard, ensureFonts, header, introOverlay,
  legibility, loadBrand, newCanvas, presenterCard, roundRectPath, progressBar, resolveFfmpegPath, resolveMusic, span, spawnEncoder,
  ticker, videoFrames, voiceEnvelope,
  type ReelIntro, type ReelMedia, type ReelMusic, type ReelOutro, type ReelPresenter, type ReelStyle,
} from './reelTheme'

export type { ReelIntro, ReelMedia, ReelMusic, ReelOutro, ReelPresenter, ReelStyle } from './reelTheme'
export type ReelLayout = 'kart' | 'bulten' | 'dinamik'
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
  /** 'kart' = media card on navy; 'bulten' = photo on top + white panel; 'dinamik' = full-screen media, centred text (REELS-7). */
  layout?: ReelLayout
}

export type ReelResult = { mp4: Buffer; seconds: number; timeline: ReelTimeline }

const HEAD_SIZE = 76
const HEAD_LH = 90
const SUM_SIZE = 40
const SUM_LH = 54
const TEXT_X = SAFE.x + 20
/** Text stays left of the Instagram like / comment / share column. */
const TEXT_W = REEL_W - TEXT_X - SAFE.right
const BAR_X = SAFE.x - 12

export async function renderReel(input: ReelInput, opts: { root?: string } = {}): Promise<ReelResult> {
  if (input.layout === 'dinamik') {
    const { renderDynamic } = await import('./renderDynamic')
    return renderDynamic(input, opts)
  }
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
    const bulten = input.layout === 'bulten'
    // Bülten keeps the text panel compact (like a lower third), the photo gets the rest.
    const HS = bulten ? 50 : HEAD_SIZE
    const HL = bulten ? 60 : HEAD_LH
    const SS = bulten ? 29 : SUM_SIZE
    const SL = bulten ? 39 : SUM_LH
    const m = createCanvas(10, 10).getContext('2d')
    m.font = `${HS}px ${FONT_XB}`
    const headLines = wrapLines((s) => m.measureText(s).width, input.headline, TEXT_W, bulten ? 3 : 4)
    m.font = `${SS}px ${FONT_MD}`
    const sumLines = wrapLines((s) => m.measureText(s).width, input.summary, TEXT_W, bulten ? 3 : 2)
    const headText = headLines.join('\n')
    const tl = buildTimeline(voiceSec, headText.length, introS, OUTRO_SECONDS[outro])
    const tagH = bulten ? 58 : 62
    let tagY: number, headY: number, sumY: number, panelTop: number
    // Bülten: the ticker is the last thing on screen (no empty band below it).
    const tickerY = bulten ? REEL_H - TICKER_H : TICKER_Y
    if (bulten) {
      // white panel grows up from the ticker; the red band sits on the photo right above it
      const panelH = 26 + headLines.length * HL + (sumLines.length ? 10 + sumLines.length * SL : 0) + 24
      panelTop = tickerY - panelH
      tagY = panelTop - tagH
      headY = panelTop + 26
      sumY = headY + headLines.length * HL + 10
    } else {
      const blockH = tagH + 30 + headLines.length * HL + (sumLines.length ? 22 + sumLines.length * SL : 0)
      tagY = Math.min(1180, TICKER_Y - 40 - blockH)
      headY = tagY + tagH + 30
      sumY = headY + headLines.length * HL + 22
      panelTop = tagY
    }
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
    // Media card: the story's image / video plays up front (not cropped to 9:16, not under the text);
    // a blurred, darkened copy fills the frame behind it.
    const cardY = SAFE.top + 116
    const card = bulten
      ? { x: 0, y: 0, w: REEL_W, h: Math.round(panelTop / 2) * 2 }
      : { x: 64, y: cardY, w: 952, h: Math.round(Math.max(380, Math.min(900, tagY - 36 - cardY)) / 2) * 2 }
    const vid = input.media.kind === 'video' ? videoFrames(ffmpeg, input.media.path, tl.frames, card.w, card.h) : null
    const enc = spawnEncoder(ffmpeg, {
      voice: voicePath, bed: bedPath(root, music), fx: fxPath,
      filter: audioFilterGraph(tl.voiceStart, music ? 0.9 : 0), total: tl.total, out: outPath,
    })

    const { canvas, ctx } = newCanvas()
    const vidCanvas = createCanvas(card.w, card.h)
    const vctx = vidCanvas.getContext('2d')
    const vidData = vctx.createImageData(card.w, card.h)
    let haveVid = false
    const tiny = createCanvas(27, 48)
    const tctx = tiny.getContext('2d')
    // Backdrop (blurred media + navy veil + card shadow) is composed once (image) or every 10 frames (video).
    const bg = createCanvas(REEL_W, REEL_H)
    const bgx = bg.getContext('2d')
    const refreshBackdrop = (src: Image | Canvas) => {
      drawCover(tctx, src, 0, 0, 27, 48)
      bgx.imageSmoothingEnabled = true
      bgx.imageSmoothingQuality = 'high'
      bgx.drawImage(tiny, 0, 0, REEL_W, REEL_H)
      bgx.fillStyle = 'rgba(7,21,48,0.62)'
      bgx.fillRect(0, 0, REEL_W, REEL_H)
      bgx.save()
      bgx.shadowColor = 'rgba(0,0,0,0.45)'
      bgx.shadowBlur = 40
      bgx.shadowOffsetY = 12
      roundRectPath(bgx, card.x, card.y, card.w, card.h, 34)
      bgx.fillStyle = '#000'
      bgx.fill()
      bgx.restore()
    }
    if (image) refreshBackdrop(image)
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
          if (!haveVid || i % 10 === 0) refreshBackdrop(vidCanvas)
          haveVid = true
        }
      }
      if (bulten) {
        // photo / video full width down to the panel (gentle Ken Burns)
        ctx.fillStyle = NAVY
        ctx.fillRect(0, 0, REEL_W, REEL_H)
        if (image) drawCover(ctx, image, 0, 0, REEL_W, card.h, 1.04 + 0.08 * mainP, 0.5, 0.42)
        else if (haveVid) ctx.drawImage(vidCanvas, 0, 0)
        else {
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, 0, REEL_W, card.h)
          ctx.clip()
          brandBackground(ctx, brand, t, mainP, accent, input.category)
          ctx.restore()
        }
        const gt = ctx.createLinearGradient(0, 0, 0, SAFE.top + 200)
        gt.addColorStop(0, 'rgba(7,21,48,0.5)')
        gt.addColorStop(1, 'rgba(7,21,48,0)')
        ctx.fillStyle = gt
        ctx.fillRect(0, 0, REEL_W, SAFE.top + 200)
        progressBar(ctx, mainP)
        // white panel slides up, red band slides in
        const pk = span(t, tagIn - 0.2, tagIn + 0.35)
        const py = panelTop + (tickerY - panelTop) * (1 - pk)
        ctx.fillStyle = WHITE
        ctx.fillRect(0, py, REEL_W, tickerY - py)
        bulletinBand(ctx, cat, tagY + (tickerY - panelTop) * (1 - pk), tagH, accent, span(t, tagIn, tagIn + 0.45), t, input.breaking)
        const shown = Math.max(0, Math.min(headText.length, Math.floor((t - tl.typeStart) * TYPE_CPS)))
        const typed = headText.slice(0, shown).split('\n')
        ctx.font = `${HS}px ${FONT_XB}`
        ctx.fillStyle = NAVY
        ctx.textBaseline = 'top'
        if (pk > 0.98) typed.forEach((line, k) => ctx.fillText(line, TEXT_X, headY + k * HL))
        const caretOn = shown < headText.length || (Math.floor(t * 2) % 2 === 0 && t < tl.summaryStart + 1)
        if (pk > 0.98 && caretOn && t >= tl.typeStart - 0.2 && t < tl.endStart) {
          const cx = TEXT_X + ctx.measureText(typed[typed.length - 1] ?? '').width + 6
          ctx.fillStyle = RED
          ctx.fillRect(cx, headY + HL * (typed.length - 1) + 6, 8, HS - 4)
        }
        if (t >= tl.summaryStart && sumLines.length) {
          const k = span(t, tl.summaryStart, tl.summaryStart + 0.5)
          ctx.save()
          ctx.globalAlpha = k
          ctx.font = `${SS}px ${FONT_MD}`
          ctx.fillStyle = '#4a5468'
          sumLines.forEach((line, n) => ctx.fillText(line, TEXT_X, sumY + n * SL + Math.round(18 * (1 - k))))
          ctx.restore()
        }
      } else {
      if (image || haveVid) {
        ctx.drawImage(bg, 0, 0)
        ctx.save()
        roundRectPath(ctx, card.x, card.y, card.w, card.h, 34)
        ctx.clip()
        if (image) drawCover(ctx, image, card.x, card.y, card.w, card.h, 1.02 + 0.08 * mainP, 0.48 + 0.04 * mainP, 0.45)
        else ctx.drawImage(vidCanvas, card.x, card.y)
        ctx.restore()
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'
        ctx.lineWidth = 2
        roundRectPath(ctx, card.x, card.y, card.w, card.h, 34)
        ctx.stroke()
        // top fade for the header, bottom fade into the text block
        const gt = ctx.createLinearGradient(0, 0, 0, SAFE.top + 110)
        gt.addColorStop(0, 'rgba(7,21,48,0.85)')
        gt.addColorStop(1, 'rgba(7,21,48,0)')
        ctx.fillStyle = gt
        ctx.fillRect(0, 0, REEL_W, SAFE.top + 110)
        const gTop = Math.min(card.y + card.h - 40, tagY - 40)
        const gb = ctx.createLinearGradient(0, gTop, 0, tagY + 30)
        gb.addColorStop(0, 'rgba(7,21,48,0)')
        gb.addColorStop(1, 'rgba(7,21,48,0.96)')
        ctx.fillStyle = gb
        ctx.fillRect(0, gTop, REEL_W, tagY + 30 - gTop)
        ctx.fillStyle = 'rgba(7,21,48,0.96)'
        ctx.fillRect(0, tagY + 30, REEL_W, REEL_H - tagY - 30)
      } else {
        brandBackground(ctx, brand, t, mainP, accent, input.category)
        legibility(ctx, tagY)
      }
      progressBar(ctx, mainP)
      header(ctx, brand, -140 + (SAFE.top + 140) * span(t, Math.max(0, introS - 0.1), introS + 0.4), placeLabel)

      categoryTag(ctx, cat, BAR_X, tagY, tagH, accent, span(t, tagIn, tagIn + 0.45), t, input.breaking)

      // typewriter headline + red side bar
      const shown = Math.max(0, Math.min(headText.length, Math.floor((t - tl.typeStart) * TYPE_CPS)))
      const typed = headText.slice(0, shown).split('\n')
      ctx.fillStyle = RED
      ctx.fillRect(BAR_X, headY + 6, 12, (Math.max(typed.length, 1) * HL - 14) * span(t, tagIn + 0.15, tagIn + 0.55))
      ctx.font = `${HS}px ${FONT_XB}`
      ctx.fillStyle = WHITE
      ctx.textBaseline = 'top'
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = 12
      typed.forEach((line, k) => ctx.fillText(line, TEXT_X, headY + k * HL))
      ctx.shadowBlur = 0
      const caretOn = shown < headText.length || (Math.floor(t * 2) % 2 === 0 && t < tl.summaryStart + 1)
      if (caretOn && t >= tl.typeStart - 0.2 && t < tl.endStart) {
        const cx = TEXT_X + ctx.measureText(typed[typed.length - 1] ?? '').width + 8
        ctx.fillStyle = RED
        ctx.fillRect(cx, headY + HL * (typed.length - 1) + 8, 9, 70)
      }

      if (t >= tl.summaryStart && sumLines.length) {
        const k = span(t, tl.summaryStart, tl.summaryStart + 0.5)
        ctx.save()
        ctx.globalAlpha = k
        ctx.font = `${SS}px ${FONT_MD}`
        ctx.fillStyle = MUTED
        sumLines.forEach((line, n) => ctx.fillText(line, TEXT_X, sumY + n * SL + Math.round(24 * (1 - k))))
        ctx.restore()
      }

      }
      if (input.presenter && level) {
        presenterCard(ctx, input.presenter, presenterPhoto, accent, bulten ? SAFE.x : card.x + 28, bulten ? SAFE.top : card.y + 28, level[i] ?? 0, span(t, introS + 0.1, introS + 0.5) * (1 - span(t, tl.endStart - 0.4, tl.endStart)))
      }
      ticker(ctx, brand, tickerText, t, span(t, introS, introS + 0.45), bulten ? 'red' : 'navy', tickerY)
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
