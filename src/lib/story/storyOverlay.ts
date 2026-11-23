import 'server-only'

/**
 * STORY-1 — canvas drawing for «Konu → Video»:
 *   - caption overlay states (transparent PNGs, frame-sized): series pill, «Temsili çizim» /
 *     «Kaynak:» note, scene label pop-in, word-by-word captions inside the safe area
 *   - still composition: any photo / AI image → 1620×2880 JPEG (cover when the
 *     aspect is close to 9:16, otherwise fitted over a blurred copy of itself)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import { FRAMES, STYLE_THEME, type Frame, type StoryStyle, type StoryTimeline } from './storyProject'
import { overlayStates, type OverlayState, type SceneMeta } from './storyStates'

export const FONT_CAP = 'NaHaberStoryXB'
export const FONT_NOTE = 'NaHaberStoryMD'
export const FONT_DISPLAY = 'NaHaberStoryDisplay'
let fontsReady = false

export function ensureStoryFonts(root: string): void {
  if (fontsReady) return
  const dir = path.join(root, 'src/lib/reels/assets/fonts')
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-ExtraBold.ttf'), FONT_CAP)
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-Medium.ttf'), FONT_NOTE)
  GlobalFonts.registerFromPath(path.join(dir, 'Anton-Regular.ttf'), FONT_DISPLAY)
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

function layoutLines(ctx: SKRSContext2D, words: string[], maxW: number): number[][] {
  const space = ctx.measureText(' ').width
  const lines: number[][] = [[]]
  let w = 0
  words.forEach((word, i) => {
    const ww = ctx.measureText(word).width
    const cur = lines[lines.length - 1]
    if (cur.length && w + space + ww > maxW) {
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
  /** default: vertical 1080×1920 */
  frame?: Frame
}

export function drawOverlay(ctx: SKRSContext2D, input: OverlayInput, st: OverlayState | null): void {
  const F = input.frame ?? FRAMES.vertical
  const OUT_W = F.w
  const SAFE = F.safe
  ctx.clearRect(0, 0, F.w, F.h)
  const th = STYLE_THEME[input.style]
  // series pill
  const pill = input.seriesLabel.toLocaleUpperCase('tr-TR').slice(0, 32)
  ctx.font = `30px ${FONT_CAP}`
  const pw = ctx.measureText(pill).width + 48
  ctx.fillStyle = th.pill
  rr(ctx, OUT_W / 2 - pw / 2, F.pillY, pw, 56, 12)
  ctx.fill()
  ctx.fillStyle = th.pillText
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(pill, OUT_W / 2, F.pillY + 29)
  if (!st) return
  const meta = input.meta[st.scene]
  // honesty notes
  const notes = [meta?.aiNote ? 'Temsili çizim' : null, meta?.source ? `Kaynak: ${meta.source}` : null].filter(Boolean) as string[]
  if (notes.length) {
    ctx.font = `26px ${FONT_NOTE}`
    const text = notes.join(' · ').slice(0, 60)
    const nw = ctx.measureText(text).width + 28
    ctx.fillStyle = 'rgba(0,0,0,0.38)'
    rr(ctx, OUT_W / 2 - nw / 2, F.pillY + 68, nw, 40, 10)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(text, OUT_W / 2, F.pillY + 89)
  }
  // GÖREV 45 «Bilgi animasyonu»: big headline banner + sub line pop in with the label
  if (input.style === 'animasyon' && meta?.headline && st.pop > 0) drawHeadline(ctx, F, meta, st.scene, st.pop)
  // label pop-in
  if (meta?.label && st.pop > 0) {
    const s = 0.82 + 0.18 * backOut(st.pop)
    ctx.save()
    ctx.globalAlpha = Math.min(1, st.pop * 1.6)
    ctx.font = `${F.labelSize}px ${FONT_CAP}`
    const lw = ctx.measureText(meta.label).width + 56
    const cx = SAFE.left + 30 + lw / 2
    const cy = F.labelY
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
  const CAP_LH = F.capLineH
  ctx.font = `${F.capSize}px ${FONT_CAP}`
  ctx.textAlign = 'left'
  const words = chunk.words.map((w) => w.word)
  const lines = layoutLines(ctx, words, SAFE.right - SAFE.left - 70).slice(0, 3)
  const space = ctx.measureText(' ').width
  const widths = lines.map((ln) => ln.reduce((a, i, k) => a + ctx.measureText(words[i]).width + (k ? space : 0), 0))
  const boxW = Math.max(...widths) + 64
  const boxH = lines.length * CAP_LH + 36
  const cx = (SAFE.left + SAFE.right) / 2
  const y0 = F.captionY - boxH / 2
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

/** Headline colours rotate per scene (NaHaber red, green, blue, orange, purple). */
export const HEADLINE_COLORS = ['#E30613', '#16A34A', '#2563EB', '#EA580C', '#7C3AED']

function fitFont(ctx: SKRSContext2D, text: string, family: string, start: number, min: number, maxW: number): number {
  let size = start
  ctx.font = `${size}px ${family}`
  while (size > min && ctx.measureText(text).width > maxW) {
    size -= 4
    ctx.font = `${size}px ${family}`
  }
  return size
}

/** Big tilted headline banner (Anton) with a yellow sub line; scale/alpha from the pop progress. */
export function drawHeadline(ctx: SKRSContext2D, F: Frame, meta: SceneMeta, scene: number, pop: number): void {
  const vertical = F.h > F.w
  const head = (meta.headline ?? '').toLocaleUpperCase('tr-TR')
  const maxW = (F.safe.right - F.safe.left) * (vertical ? 1.02 : 0.8)
  const size = fitFont(ctx, head, FONT_DISPLAY, vertical ? 104 : 96, 56, maxW - 60)
  const tw = ctx.measureText(head).width
  const bw = tw + 60
  const bh = size * 1.32
  const cx = (F.safe.left + F.safe.right) / 2
  const cy = vertical ? F.safe.top + 352 : F.safe.top + 250
  const s = 0.6 + 0.4 * backOut(pop)
  ctx.save()
  ctx.globalAlpha = Math.min(1, pop * 1.8)
  ctx.translate(cx, cy)
  ctx.rotate((-2 * Math.PI) / 180)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  rr(ctx, -bw / 2 + 8, -bh / 2 + 10, bw, bh, 16)
  ctx.fill()
  ctx.fillStyle = HEADLINE_COLORS[scene % HEADLINE_COLORS.length]
  rr(ctx, -bw / 2, -bh / 2, bw, bh, 16)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(head, 0, size * 0.04)
  ctx.restore()
  const sub = (meta.sub ?? '').toLocaleUpperCase('tr-TR')
  if (!sub || pop < 0.35) return
  const sp = Math.min(1, (pop - 0.35) / 0.65)
  const ss = fitFont(ctx, sub, FONT_CAP, vertical ? 40 : 36, 26, maxW - 40)
  const sw = ctx.measureText(sub).width + 40
  const sh = ss * 1.6
  ctx.save()
  ctx.globalAlpha = sp
  ctx.translate(cx, cy + bh / 2 + sh / 2 + 22)
  ctx.scale(0.8 + 0.2 * backOut(sp), 0.8 + 0.2 * backOut(sp))
  ctx.fillStyle = '#FFC400'
  rr(ctx, -sw / 2, -sh / 2, sw, sh, 10)
  ctx.fill()
  ctx.fillStyle = '#141414'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(sub, 0, 1)
  ctx.restore()
}

/** Writes the overlay PNG states into `dir` and returns them for the concat list. */
export async function renderOverlayStates(dir: string, input: OverlayInput, root = process.cwd()): Promise<Array<{ file: string; duration: number }>> {
  ensureStoryFonts(root)
  const F = input.frame ?? FRAMES.vertical
  const canvas = createCanvas(F.w, F.h)
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
    // near-white edge rows (scan / torn-paper border) are also margin
    return std < 9 || mean > 215 && std < 30 || (allowPaper && mean > 165 && std < 18)
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

/** Any image → still JPEG 10 % larger than the frame (flat margins trimmed; cover or blurred fill). */
export async function composeStill(input: Buffer, outFile: string, frame: Frame = FRAMES.vertical): Promise<void> {
  const STILL_W = frame.stillW
  const STILL_H = frame.stillH
  const vertical = frame.h > frame.w
  const img = await loadImage(input)
  // Find the content box on a small, box-averaged copy. Averaging in JS (4×4 blocks of a
  // 288 px copy) keeps paper texture smooth even where the canvas samples nearest-neighbour
  // on large downscales (seen on the server: the blank-paper bottom was not detected).
  const B = 4
  const sw = 72
  const sh = Math.max(8, Math.round((img.height / img.width) * sw))
  const probe = createCanvas(sw * B, sh * B)
  const pctx = probe.getContext('2d')
  pctx.imageSmoothingEnabled = true
  pctx.imageSmoothingQuality = 'high'
  pctx.drawImage(img, 0, 0, sw * B, sh * B)
  const px = pctx.getImageData(0, 0, sw * B, sh * B).data
  const lum = new Float32Array(sw * sh)
  for (let y = 0; y < sh * B; y++) {
    for (let x = 0; x < sw * B; x++) {
      const i = (y * sw * B + x) * 4
      lum[Math.floor(y / B) * sw + Math.floor(x / B)] += (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / (B * B)
    }
  }
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
  // vertical: up to square-ish pictures fill the frame (sides cropped); real landscape photos get a blurred fill.
  // horizontal: 4:3 … 21:9 fill the frame; portrait photos sit in the middle over a blurred copy.
  if (vertical ? ar >= target * 0.8 && ar <= target * 2 : ar >= target * 0.72 && ar <= target * 1.35) {
    const { w, h } = coverRect()
    ctx.drawImage(img, sx, sy, sWidth, sHeight, (STILL_W - w) / 2, (STILL_H - h) / 2, w, h)
  } else {
    const { w, h } = coverRect()
    ctx.filter = 'blur(48px) brightness(0.72)'
    ctx.drawImage(img, sx, sy, sWidth, sHeight, (STILL_W - w) / 2, (STILL_H - h) / 2, w, h)
    ctx.filter = 'none'
    const s = vertical ? Math.min(STILL_W / sWidth, (STILL_H * 0.62) / sHeight) : Math.min((STILL_W * 0.92) / sWidth, (STILL_H * 0.94) / sHeight)
    const fw = sWidth * s
    const fh = sHeight * s
    // vertical: fitted image in the upper-middle part, above the caption band; horizontal: centred
    const fy = vertical ? Math.max(STILL_H * 0.13, STILL_H * 0.42 - fh / 2) : (STILL_H - fh) / 2
    ctx.drawImage(img, sx, sy, sWidth, sHeight, (STILL_W - fw) / 2, fy, fw, fh)
  }
  await fs.writeFile(outFile, await canvas.encode('jpeg', 90))
}

/**
 * Free «metin kartı» still for a scene without a photo / video: theme-coloured background,
 * soft light, a large key word and the project title. The caption runs over it as usual.
 */
export async function composeCardStill(o: { word: string; title: string; style: StoryStyle; index: number; outFile: string; frame?: Frame; root?: string }): Promise<void> {
  ensureStoryFonts(o.root ?? process.cwd())
  const F = o.frame ?? FRAMES.vertical
  const W = F.stillW
  const H = F.stillH
  const th = STYLE_THEME[o.style]
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  const BG: Record<StoryStyle, [string, string]> = {
    animasyon: ['#16203F', '#0B1020'],
    paper: ['#3A2A1C', '#1C140D'],
    doodle: ['#2A2A2A', '#121212'],
    dark: ['#0F1B2D', '#05080F'],
    photo: ['#1E1E22', '#0A0A0C'],
  }
  const [c0, c1] = BG[o.style]
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H)
  g.addColorStop(0, c0)
  g.addColorStop(1, c1)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // soft light that moves from scene to scene
  const lx = W * (0.25 + 0.5 * ((o.index * 37) % 100) / 100)
  const ly = H * (0.22 + 0.3 * ((o.index * 61) % 100) / 100)
  const rg = ctx.createRadialGradient(lx, ly, 10, lx, ly, Math.max(W, H) * 0.7)
  rg.addColorStop(0, 'rgba(255,255,255,0.14)')
  rg.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, H)
  // fine diagonal lines (texture so the drift is visible)
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 2
  for (let x = -H; x < W; x += 28) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + H, H)
    ctx.stroke()
  }
  const vertical = F.h > F.w
  const cx = W / 2
  const cy = vertical ? H * 0.4 : H * 0.42
  const word = o.word.toLocaleUpperCase('tr-TR').slice(0, 40)
  let size = vertical ? 132 : 150
  ctx.font = `${size}px ${FONT_CAP}`
  const maxW = W * 0.78
  while (size > 56 && ctx.measureText(word).width > maxW) {
    size -= 6
    ctx.font = `${size}px ${FONT_CAP}`
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = th.highlight
  ctx.fillText(word, cx, cy)
  // accent bar + title
  ctx.fillStyle = th.labelBg
  rr(ctx, cx - 90, cy + size * 0.75, 180, 10, 5)
  ctx.fill()
  const title = o.title.slice(0, 70)
  if (title) {
    ctx.font = `${vertical ? 40 : 38}px ${FONT_NOTE}`
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.fillText(title, cx, cy + size * 0.75 + 66)
  }
  await fs.writeFile(o.outFile, await canvas.encode('jpeg', 90))
}

/** Small JPEG (≤ 768 px) for the AI to look at. */
export async function previewJpeg(input: Buffer, max = 768): Promise<Buffer> {
  const img = await loadImage(input)
  const s = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = createCanvas(Math.round(img.width * s), Math.round(img.height * s))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.encode('jpeg', 82)
}
