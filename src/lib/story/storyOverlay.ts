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

/**
 * Content box of an image without flat margins (blank paper, borders): rows / columns
 * from each edge whose luminance barely varies are trimmed. Image models sometimes
 * draw the picture in the upper part and leave the rest as empty paper.
 */
export function contentBox(lum: Float32Array, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  const stats = (vals: number[]) => {
    const m = vals.reduce((a, b) => a + b, 0) / vals.length
    return { mean: m, std: Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length) }
  }
  // flat = almost no detail; paper = light, lightly textured (aged paper with stains)
  const blank = (v: number[], allowPaper: boolean) => {
    const { mean, std } = stats(v)
    return std < 9 || (allowPaper && mean > 185 && std < 18)
  }
  let y0 = 0
  let y1 = h
  let x0 = 0
  let x1 = w
  const row = (y: number) => Array.from({ length: x1 - x0 }, (_, i) => lum[y * w + x0 + i])
  const col = (x: number) => Array.from({ length: y1 - y0 }, (_, i) => lum[(y0 + i) * w + x])
  // bottom and sides may be empty paper; the top only when it is flat (a light sky is content)
  while (y1 - y0 > h * 0.5 && blank(row(y1 - 1), true)) y1--
  while (y1 - y0 > h * 0.5 && blank(row(y0), false)) y0++
  while (x1 - x0 > w * 0.5 && blank(col(x1 - 1), true)) x1--
  while (x1 - x0 > w * 0.5 && blank(col(x0), true)) x0++
  return { x0, y0, x1, y1 }
}

/** Any image → 1188×2112 JPEG still (flat margins trimmed; cover or blurred fill). */
export async function composeStill(input: Buffer, outFile: string): Promise<void> {
  const img = await loadImage(input)
  // find the content box on a small copy
  const sw = 72
  const sh = Math.max(8, Math.round((img.height / img.width) * sw))
  const probe = createCanvas(sw, sh)
  const pctx = probe.getContext('2d')
  pctx.drawImage(img, 0, 0, sw, sh)
  const px = pctx.getImageData(0, 0, sw, sh).data
  const lum = new Float32Array(sw * sh)
  for (let i = 0; i < sw * sh; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
  const box = contentBox(lum, sw, sh)
  const kx = img.width / sw
  const ky = img.height / sh
  // a small inset removes the ragged / torn edge of a drawn frame
  const trimmed = box.x0 > 0 || box.y0 > 0 || box.x1 < sw || box.y1 < sh
  const inset = trimmed ? 0.015 : 0
  let sx = box.x0 * kx
  let sy = box.y0 * ky
  let sWidth = (box.x1 - box.x0) * kx
  let sHeight = (box.y1 - box.y0) * ky
  sx += sWidth * inset
  sy += sHeight * inset
  sWidth *= 1 - inset * 2
  sHeight *= 1 - inset * 2

  const canvas = createCanvas(STILL_W, STILL_H)
  const ctx = canvas.getContext('2d')
  const ar = sWidth / sHeight
  const target = STILL_W / STILL_H
  const coverRect = () => {
    const s = Math.max(STILL_W / sWidth, STILL_H / sHeight)
    return { w: sWidth * s, h: sHeight * s }
  }
  if (ar >= target * 0.8 && ar <= target * 1.25) {
    const { w, h } = coverRect()
    ctx.drawImage(img, sx, sy, sWidth, sHeight, (STILL_W - w) / 2, (STILL_H - h) / 2, w, h)
  } else {
    const { w, h } = coverRect()
    ctx.filter = 'blur(48px) brightness(0.72)'
    ctx.drawImage(img, sx, sy, sWidth, sHeight, (STILL_W - w) / 2, (STILL_H - h) / 2, w, h)
    ctx.filter = 'none'
    const s = Math.min(STILL_W / sWidth, (STILL_H * 0.62) / sHeight)
    const fw = sWidth * s
    const fh = sHeight * s
    // fitted image in the upper-middle part, above the caption band
    const fy = Math.max(STILL_H * 0.13, STILL_H * 0.42 - fh / 2)
    ctx.drawImage(img, sx, sy, sWidth, sHeight, (STILL_W - fw) / 2, fy, fw, fh)
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
