import 'server-only'

/**
 * REELS — «Günün Öne Çıkanları»: several stories (2–7) in one NaHaber reel.
 *   title card (list of today's headlines) → one segment per story (number badge,
 *   category tag, headline, own voice line) with soft cross-fades → end card.
 * Story-style segmented progress bar on top; one theme music bed under all.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { REEL_FPS, REEL_W, wrapLines } from './timeline'
import { audioFilterGraph, readWav, writeWav, type Pcm } from './audio'
import {
  FONT_MD, FONT_XB, MUTED, NAVY, NAVY2, RED, SAFE, STYLE_ACCENT, TICKER_Y, WHITE,
  INTRO_SECONDS, OUTRO_SECONDS, audioDir, bands, bedPath, brandBackground, categoryTag, clamp01, drawCover, endCard,
  ensureFonts, header, introOverlay, legibility, loadBrand, newCanvas, presenterCard, progressBar, resolveFfmpegPath,
  roundRectPath, slantPath, span, spawnEncoder, ticker, voiceEnvelope, wordmark, wordmarkWidth,
  type Brand, type ReelIntro, type ReelMedia, type ReelMusic, type ReelOutro, type ReelPresenter, type ReelStyle,
} from './reelTheme'

export type DigestTransition = 'fade' | 'slide' | 'number'
export const DIGEST_TRANSITIONS: DigestTransition[] = ['fade', 'slide', 'number']

export type DigestItem = {
  headline: string
  category: string
  style?: ReelStyle
  place?: string | null
  media: ReelMedia
  /** PCM16 WAV voice line for this story. */
  voiceWav: Buffer
}

export type DigestInput = {
  title?: string // default «GÜNÜN ÖNE ÇIKANLARI»
  dateLabel: string
  items: DigestItem[]
  /** Voice for the title card («NaHaber'de günün öne çıkanları.») */
  introVoiceWav: Buffer
  /** Voice for the end card («Haberlerin tamamı nahaber.com'da.») */
  outroVoiceWav: Buffer
  music?: ReelMusic
  /** 'list' = title card with the numbered list (default); others add that intro before it. */
  intro?: ReelIntro | 'list'
  transition?: DigestTransition
  outro?: ReelOutro
  presenter?: ReelPresenter | null
}

export type DigestResult = { mp4: Buffer; seconds: number }

const XFADE = 0.35
const HEAD_SIZE = 74
const HEAD_LH = 88

type Scene = { kind: 'title' | 'item' | 'end'; start: number; dur: number; voiceAt: number; index: number }

function mixVoice(dst: Float32Array, sr: number, clip: Pcm, at: number): void {
  // simple linear resample to sr
  const ratio = clip.sampleRate / sr
  const start = Math.round(at * sr)
  const n = Math.floor(clip.data.length / ratio)
  for (let i = 0; i < n; i++) {
    const j = start + i
    if (j >= dst.length) break
    const x = i * ratio
    const a = Math.floor(x)
    const f = x - a
    dst[j]! += (clip.data[a] ?? 0) * (1 - f) + (clip.data[a + 1] ?? 0) * f
  }
}

export async function renderDigest(input: DigestInput, opts: { root?: string } = {}): Promise<DigestResult> {
  const root = opts.root ?? process.cwd()
  if (input.items.length < 2 || input.items.length > 7) throw new Error('reels: digest needs 2–7 stories')
  ensureFonts(root)
  const ffmpeg = await resolveFfmpegPath()
  const brand = await loadBrand(root)
  const title = (input.title ?? 'GÜNÜN ÖNE ÇIKANLARI').toLocaleUpperCase('tr-TR')
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'digest-'))
  try {
    // ---- timeline
    const v0 = readWav(input.introVoiceWav)
    const vEnd = readWav(input.outroVoiceWav)
    const vItems = input.items.map((it) => readWav(it.voiceWav))
    const sec = (p: Pcm) => p.data.length / p.sampleRate
    const scenes: Scene[] = []
    let cur = 0
    const introKind: ReelIntro | 'list' = input.intro ?? 'list'
    const introS = introKind === 'list' ? 0 : INTRO_SECONDS[introKind]
    const transition: DigestTransition = input.transition ?? 'fade'
    const outroKind: ReelOutro = input.outro ?? 'logo'
    const titleDur = introS + Math.max(3.4, 0.45 + sec(v0) + 1.4)
    scenes.push({ kind: 'title', start: 0, dur: titleDur, voiceAt: introS + 0.45, index: -1 })
    cur = titleDur
    vItems.forEach((v, i) => {
      const dur = 0.35 + sec(v) + 0.55
      scenes.push({ kind: 'item', start: cur - XFADE, dur: dur + XFADE, voiceAt: cur + 0.15, index: i })
      cur += dur
    })
    const endDur = Math.max(OUTRO_SECONDS[outroKind] + 0.7, 0.35 + sec(vEnd) + 1.0)
    scenes.push({ kind: 'end', start: cur - XFADE, dur: endDur + XFADE, voiceAt: cur + 0.2, index: -1 })
    const total = cur + endDur
    const frames = Math.ceil(total * REEL_FPS)

    // ---- audio: one voice track with every line at its slot
    const SR = 24000
    const voice = new Float32Array(Math.ceil(total * SR))
    mixVoice(voice, SR, v0, scenes[0]!.voiceAt)
    scenes.filter((s) => s.kind === 'item').forEach((s) => mixVoice(voice, SR, vItems[s.index]!, s.voiceAt))
    mixVoice(voice, SR, vEnd, scenes[scenes.length - 1]!.voiceAt)
    const adir = audioDir(root)
    const load = async (f: string) => readWav(await fs.readFile(path.join(adir, f)))
    const intro = await load(`intro-${introKind === 'list' ? 'soft' : introKind}.wav`)
    const outro = await load(outroKind === 'follow' ? 'outro-follow.wav' : outroKind === 'short' ? 'outro-short.wav' : 'outro-soft.wav')
    const whoosh = await load('whoosh-up.wav')
    const tick = await load('intro-minimal.wav')
    const fxSr = intro.sampleRate
    const fx = new Float32Array(Math.ceil(total * fxSr))
    const put = (clip: Pcm, at: number, g: number) => {
      const s0 = Math.round(at * fxSr)
      for (let i = 0; i < clip.data.length && s0 + i < fx.length; i++) if (s0 + i >= 0) fx[s0 + i]! += clip.data[i]! * g
    }
    put(intro, 0, 0.8)
    scenes.filter((s) => s.kind === 'item').forEach((s) => put(transition === 'slide' ? whoosh : tick, s.start + XFADE * 0.3, transition === 'slide' ? 0.12 : 0.35))
    put(outro, scenes[scenes.length - 1]!.start + XFADE * 0.5, 0.8)
    const voicePath = path.join(work, 'voice.wav')
    const fxPath = path.join(work, 'fx.wav')
    const outPath = path.join(work, 'digest.mp4')
    await fs.writeFile(voicePath, writeWav({ sampleRate: SR, data: voice }))
    await fs.writeFile(fxPath, writeWav({ sampleRate: fxSr, data: fx }))

    const music = input.music === 'none' ? null : !input.music || input.music === 'auto' ? 'modern' : input.music
    const presenterPhoto = input.presenter?.photo ? await loadImage(input.presenter.photo).catch(() => null) : null
    const level = input.presenter ? voiceEnvelope({ sampleRate: SR, data: voice }, 0, frames, REEL_FPS) : null

    // ---- media
    const images: Array<Image | null> = []
    for (const it of input.items) images.push(it.media.kind === 'image' ? await loadImage(it.media.data) : null)

    // ---- layout per item (measured once)
    const m = createCanvas(10, 10).getContext('2d')
    m.font = `${HEAD_SIZE}px ${FONT_XB}`
    const itemLines = input.items.map((it) => wrapLines((s) => m.measureText(s).width, it.headline, REEL_W - (SAFE.x + 20) - SAFE.right, 4))
    m.font = `36px ${FONT_MD}`
    const listLines = input.items.map((it) => wrapLines((s) => m.measureText(s).width, it.headline, REEL_W - 210 - SAFE.x, 1)[0] ?? '')

    const enc = spawnEncoder(ffmpeg, {
      voice: voicePath, bed: bedPath(root, music), fx: fxPath,
      filter: audioFilterGraph(0, music ? 0.9 : 0), total, out: outPath,
    })
    const { canvas, ctx } = newCanvas()
    const n = input.items.length
    const tickerText = `${title}  •  ${input.dateLabel}  •  Haberlerin tamamı nahaber.com’da  •  `

    const drawTitle = (c: SKRSContext2D, lt: number) => {
      const g = c.createLinearGradient(0, 0, 0, 1920)
      g.addColorStop(0, NAVY2)
      g.addColorStop(1, NAVY)
      c.fillStyle = g
      c.fillRect(0, 0, REEL_W, 1920)
      bands(c, lt, 0.7)
      const k = span(lt, 0.0, 0.5)
      c.save()
      c.globalAlpha *= k
      c.drawImage(brand.tile, (REEL_W - 140) / 2, SAFE.top + 10, 140, 140)
      c.restore()
      const ww = wordmarkWidth(c, 64)
      wordmark(c, (REEL_W - ww) / 2, SAFE.top + 170, 64, span(lt, 0.15, 0.55))
      // title tag
      const tk = span(lt, 0.3, 0.75)
      c.font = `54px ${FONT_XB}`
      const tw = c.measureText(title).width
      c.save()
      c.globalAlpha *= tk
      c.fillStyle = RED
      slantPath(c, (REEL_W - tw) / 2 - 40, 560, tw + 60, 92, 20)
      c.fill()
      c.fillStyle = WHITE
      c.textBaseline = 'middle'
      c.fillText(title, (REEL_W - tw) / 2, 608)
      c.font = `36px ${FONT_MD}`
      c.fillStyle = MUTED
      const dl = input.dateLabel
      c.fillText(dl, (REEL_W - c.measureText(dl).width) / 2, 700)
      c.restore()
      // numbered list
      listLines.forEach((line, i) => {
        const a = span(lt, 0.7 + i * 0.18, 1.0 + i * 0.18)
        // list stays above the Instagram caption area (SAFE.bottom)
        const step = Math.min(150, Math.floor((SAFE.bottom - 790) / Math.max(1, listLines.length)))
        const y = 790 + i * step
        c.save()
        c.globalAlpha *= a
        c.translate(60 * (1 - a), 0)
        const acc = STYLE_ACCENT[input.items[i]!.style ?? 'haber']
        c.fillStyle = acc
        roundRectPath(c, SAFE.x, y, 84, 84, 18)
        c.fill()
        c.font = `48px ${FONT_XB}`
        c.fillStyle = WHITE
        c.textBaseline = 'middle'
        const ns = String(i + 1)
        c.fillText(ns, SAFE.x + 42 - c.measureText(ns).width / 2, y + 44)
        c.font = `26px ${FONT_XB}`
        c.fillStyle = MUTED
        c.textBaseline = 'top'
        c.fillText(input.items[i]!.category.toLocaleUpperCase('tr-TR'), SAFE.x + 110, y + 2)
        c.font = `36px ${FONT_MD}`
        c.fillStyle = WHITE
        c.fillText(line, SAFE.x + 110, y + 38)
        c.restore()
      })
    }

    const drawItem = (c: SKRSContext2D, idx: number, lt: number, dur: number, t: number) => {
      const it = input.items[idx]!
      const style = it.style ?? 'haber'
      const accent = STYLE_ACCENT[style]
      const p = clamp01(lt / dur)
      const img = images[idx]
      if (img) drawCover(c, img, 0, 0, REEL_W, 1920, 1.06 + 0.08 * p, 0.5, 0.45)
      else brandBackground(c, brand, t, p, accent, it.category)
      const lines = itemLines[idx]!
      const headY = Math.min(1260, TICKER_Y - 70 - lines.length * HEAD_LH)
      const tagY = headY - 92
      const numY = tagY - 170
      legibility(c, numY + 40)
      progressBar(c, 0, n, idx, (lt - XFADE) / (dur - XFADE))
      header(c, brand, SAFE.top, `${n} HABER • ${input.dateLabel.toLocaleUpperCase('tr-TR')}`, false)
      // number badge
      const bk = span(lt, XFADE * 0.6, XFADE + 0.4)
      c.save()
      c.globalAlpha *= bk
      c.fillStyle = WHITE
      roundRectPath(c, SAFE.x - 12, numY + 20 * (1 - bk), 132, 132, 26)
      c.fill()
      c.font = `92px ${FONT_XB}`
      c.fillStyle = NAVY
      c.textBaseline = 'middle'
      const ns = String(idx + 1)
      c.fillText(ns, SAFE.x + 54 - c.measureText(ns).width / 2, numY + 70 + 20 * (1 - bk))
      c.font = `44px ${FONT_XB}`
      c.fillStyle = MUTED
      c.fillText(`/ ${n}`, SAFE.x + 140, numY + 72)
      c.restore()
      categoryTag(c, it.category.toLocaleUpperCase('tr-TR'), SAFE.x - 12, tagY, 62, accent, span(lt, XFADE * 0.8, XFADE + 0.45), t)
      if (it.place) {
        c.font = `30px ${FONT_XB}`
        c.fillStyle = MUTED
        c.textBaseline = 'middle'
        const pl = it.place.toLocaleUpperCase('tr-TR')
        c.save()
        c.globalAlpha *= span(lt, XFADE + 0.2, XFADE + 0.6)
        c.fillText(pl, REEL_W - SAFE.right - c.measureText(pl).width, tagY + 33)
        c.restore()
      }
      // headline: lines rise in one by one
      c.fillStyle = RED
      c.fillRect(SAFE.x - 12, headY + 6, 12, (lines.length * HEAD_LH - 14) * span(lt, XFADE + 0.1, XFADE + 0.5))
      c.font = `${HEAD_SIZE}px ${FONT_XB}`
      c.textBaseline = 'top'
      lines.forEach((line, k) => {
        const a = span(lt, XFADE + 0.15 + k * 0.12, XFADE + 0.55 + k * 0.12)
        c.save()
        c.globalAlpha *= a
        c.fillStyle = WHITE
        c.shadowColor = 'rgba(0,0,0,0.35)'
        c.shadowBlur = 12
        c.fillText(line, SAFE.x + 20, headY + k * HEAD_LH + 30 * (1 - a))
        c.restore()
      })
      ticker(c, brand, tickerText, t, 1)
    }

    for (let f = 0; f < frames; f++) {
      const t = f / REEL_FPS
      const active = scenes.filter((s) => t >= s.start && t < s.start + s.dur)
      for (let a = 0; a < active.length; a++) {
        const s = active[a]!
        const lt = t - s.start
        ctx.save()
        // incoming scene: fade (default), slide in from the right, or a number card
        if (a > 0) {
          const k = clamp01(lt / XFADE)
          if (transition === 'slide' && s.kind === 'item') ctx.translate(REEL_W * (1 - span(lt, 0, XFADE)), 0)
          else ctx.globalAlpha = k
        }
        if (s.kind === 'title') {
          drawTitle(ctx, Math.max(0, lt - introS))
          if (introKind !== 'list') introOverlay(ctx, brand, introKind, lt)
        } else if (s.kind === 'item') drawItem(ctx, s.index, lt, s.dur, t)
        else endCard(ctx, brand as Brand, 'soft', lt - XFADE, t, 'Haberlerin tamamı', outroKind)
        ctx.restore()
        // number card: a big «2 / 5» flashes over the first half second of each story
        if (transition === 'number' && s.kind === 'item' && lt < XFADE + 0.55) {
          const nk = lt < XFADE ? span(lt, 0, XFADE) : 1 - span(lt, XFADE + 0.25, XFADE + 0.55)
          ctx.save()
          ctx.globalAlpha = nk
          ctx.fillStyle = 'rgba(7,21,48,0.92)'
          ctx.fillRect(0, 0, REEL_W, 1920)
          ctx.font = `260px ${FONT_XB}`
          ctx.fillStyle = WHITE
          ctx.textBaseline = 'middle'
          const ns = String(s.index + 1)
          ctx.fillText(ns, (REEL_W - ctx.measureText(ns).width) / 2, 900)
          ctx.font = `60px ${FONT_XB}`
          ctx.fillStyle = RED
          const of = `/ ${n}`
          ctx.fillText(of, (REEL_W - ctx.measureText(of).width) / 2, 1080)
          ctx.restore()
        }
      }
      const cur0 = active[active.length - 1]
      if (input.presenter && level && cur0 && cur0.kind === 'item') {
        const it = input.items[cur0.index]!
        presenterCard(ctx, input.presenter, presenterPhoto, STYLE_ACCENT[it.style ?? 'haber'], SAFE.x, SAFE.top + 130, level[f] ?? 0, span(t - cur0.start, XFADE, XFADE + 0.4))
      }
      await enc.frame(canvas)
    }
    await enc.finish()
    return { mp4: await fs.readFile(outPath), seconds: total }
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
