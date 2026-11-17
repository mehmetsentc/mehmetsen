import 'server-only'

/**
 * STORY-1 — canvas drawing for «Konu → Video»:
 *   - caption overlay states (transparent 1080×1920 PNGs): series pill, «Temsili çizim» /
 *     «Kaynak:» note, scene label pop-in, word-by-word captions inside the safe area
 *   - still composition: any photo / AI image → 1620×2880 JPEG (cover when the
 *     aspect is close to 9:16, otherwise fitted over a blurred copy of itself)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import { CAPTION_CENTER_Y, OUT_H, OUT_W, SAFE, STYLE_THEME, type StoryStyle, type StoryTimeline } from './storyProject'
import { STILL_H, STILL_W } from './storyFfmpeg'
import { overlayStates, type OverlayState, type SceneMeta } from './storyStates'

export const FONT_CAP = 'NaHaberStoryXB'
export const FONT_NOTE = 'NaHaberStoryMD'
let fontsReady = false

export function ensureStoryFonts(root: string): void {
  if (fontsReady) return
  const dir = path.join(root, 'src/lib/reels/assets/fonts')
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-ExtraBold.ttf'), FONT_CAP)
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-Medium.ttf'), FONT_NOTE)
  fontsReady = true
}

function rr(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const CAP_SIZE = 58
const CAP_LH = 74
const CAP_MAX_W = SAFE.right - SAFE.left - 70

function layoutLines(ctx: SKRSContext2D, words: string[]): number[][] {
  const space = ctx.measureText(' ').width
  const lines: number[][] = [[]]
  let w = 0
  words.forEach((word, i) => {
    const ww = ctx.measureText(word).width
    const cur = lines[lines.length - 1]
    if (cur.length && w + space + ww > CAP_MAX_W) {
      lines.push([i])
      w = ww
    } else {
      cur.push(i)
      w += (cur.length > 1 ? space : 0) + ww
    }
  })
  return lines
}

function backOut(u: number): number {
  const c = 1.7
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2
}

export type OverlayInput = {
  timeline: StoryTimeline
  meta: SceneMeta[]
  style: StoryStyle
  seriesLabel: string
}

export function drawOverlay(ctx: SKRSContext2D, input: OverlayInput, st: OverlayState | null): void {
  ctx.clearRect(0, 0, OUT_W, OUT_H)
  const th = STYLE_THEME[input.style]
  // series pill
  const pill = input.seriesLabel.toLocaleUpperCase('tr-TR').slice(0, 32)
  ctx.font = `30px ${FONT_CAP}`
  const pw = ctx.measureText(pill).width + 48
  ctx.fillStyle = th.pill
  rr(ctx, OUT_W / 2 - pw / 2, 236, pw, 56, 12)
  ctx.fill()
  ctx.fillStyle = th.pillText
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(pill, OUT_W / 2, 265)
  if (!st) return
  const meta = input.meta[st.scene]
  // honesty notes
  const notes = [meta?.aiNote ? 'Temsili çizim' : null, meta?.source ? `Kaynak: ${meta.source}` : null].filter(Boolean) as string[]
  if (notes.length) {
    ctx.font = `26px ${FONT_NOTE}`
    const text = notes.join(' · ').slice(0, 60)
    const nw = ctx.measureText(text).width + 28
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    rr(ctx, OUT_W / 2 - nw / 2, 304, nw, 40, 10)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(text, OUT_W / 2, 325)
  }
  // label pop-in
  if (meta?.label && st.pop > 0) {
    const s = 0.82 + 0.18 * backOut(st.pop)
    ctx.save()
    ctx.globalAlpha = Math.min(1, st.pop * 1.6)
    ctx.font = `52px ${FONT_CAP}`
    const lw = ctx.measureText(meta.label).width + 56
    const cx = SAFE.left + 30 + lw / 2
    const cy = 440
    ctx.translate(cx, cy)
    ctx.rotate((-4 * Math.PI) / 180)
    ctx.scale(s, s)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    rr(ctx, -lw / 2 + 6, -42 + 8, lw, 84, 14)
    ctx.fill()
    ctx.fillStyle = th.labelBg
    rr(ctx, -lw / 2, -42, lw, 84, 14)
    ctx.fill()
    ctx.fillStyle = th.labelText
    ctx.textAlign = 'center'
    ctx.fillText(meta.label, 0, 2)
    ctx.restore()
  }
  // caption
  if (st.chunk === null) return
  const chunk = input.timeline.scenes[st.scene].chunks[st.chunk]
  ctx.font = `${CAP_SIZE}px ${FONT_CAP}`
  ctx.textAlign = 'left'
  const words = chunk.words.map((w) => w.word)
  const lines = layoutLines(ctx, words).slice(0, 3)
  const space = ctx.measureText(' ').width
  const widths = lines.map((ln) => ln.reduce((a, i, k) => a + ctx.measureText(words[i]).width + (k ? space : 0), 0))
  const boxW = Math.max(...widths) + 64
  const boxH = lines.length * CAP_LH + 36
  const cx = (SAFE.left + SAFE.right) / 2
  const y0 = CAPTION_CENTER_Y - boxH / 2
  ctx.fillStyle = th.box
  rr(ctx, cx - boxW / 2, y0, boxW, boxH, 22)
  ctx.fill()
  ctx.lineJoin = 'round'
  lines.forEach((ln, li) => {
    let x = cx - widths[li] / 2
    const y = y0 + 18 + CAP_LH * li + CAP_LH / 2
    ln.forEach((i) => {
      const w = chunk.words[i]
      const spoken = i < st.spoken
      ctx.lineWidth = 7
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.strokeText(w.word, x, y)
      ctx.fillStyle = spoken ? (w.highlight ? th.highlight : th.text) : th.dim
      ctx.fillText(w.word, x, y)
      x += ctx.measureText(w.word).width + space
    })
  })
}

/** Writes the overlay PNG states into `dir` and returns them for the concat list. */
export async function renderOverlayStates(dir: string, input: OverlayInput, root = process.cwd()): Promise<Array<{ file: string; duration: number }>> {
  ensureStoryFonts(root)
  const canvas = createCanvas(OUT_W, OUT_H)
  const ctx = canvas.getContext('2d')
  const out: Array<{ file: string; duration: number }> = []
  let i = 0
  for (const s of overlayStates(input.timeline)) {
    drawOverlay(ctx, input, s.state)
    const file = path.join(dir, `ov${String(i++).padStart(4, '0')}.png`)
    await fs.writeFile(file, await canvas.encode('png'))
    out.push({ file, duration: s.duration })
  }
  return out
}

/** Any image → 1620×2880 JPEG still for the zoom segment. */
export async function composeStill(input: Buffer, outFile: string): Promise<void> {
  const img = await loadImage(input)
  const canvas = createCanvas(STILL_W, STILL_H)
  const ctx = canvas.getContext('2d')
  const ar = img.width / img.height
  const target = STILL_W / STILL_H
  const cover = (iw: number, ih: number) => {
    const s = Math.max(STILL_W / iw, STILL_H / ih)
    return { w: iw * s, h: ih * s }
  }
  if (ar >= target * 0.8 && ar <= target * 1.25) {
    const { w, h } = cover(img.width, img.height)
    ctx.drawImage(img, (STILL_W - w) / 2, (STILL_H - h) / 2, w, h)
  } else {
    const { w, h } = cover(img.width, img.height)
    ctx.filter = 'blur(48px) brightness(0.72)'
    ctx.drawImage(img, (STILL_W - w) / 2, (STILL_H - h) / 2, w, h)
    ctx.filter = 'none'
    const s = Math.min(STILL_W / img.width, (STILL_H * 0.62) / img.height)
    const fw = img.width * s
    const fh = img.height * s
    // fitted image in the upper-middle part, above the caption band
    const fy = Math.max(380, (STILL_H * 0.42) - fh / 2)
    ctx.drawImage(img, (STILL_W - fw) / 2, fy, fw, fh)
  }
  await fs.writeFile(outFile, await canvas.encode('jpeg', 90))
}

/** Small JPEG (≤ 768 px) for the AI to look at. */
export async function previewJpeg(input: Buffer, max = 768): Promise<Buffer> {
  const img = await loadImage(input)
  const s = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = createCanvas(Math.round(img.width * s), Math.round(img.height * s))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.encode('jpeg', 82)
}
