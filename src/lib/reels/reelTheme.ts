import 'server-only'

/**
 * REELS — «NaHaber» reel theme: brand constants, drawing helpers and the ffmpeg
 * plumbing shared by the single-story reel (renderReel) and the multi-story
 * «Günün Öne Çıkanları» reel (renderDigest).
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createCanvas, GlobalFonts, loadImage, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { REEL_FPS, REEL_H, REEL_W, ease } from './timeline'

export type ReelMedia =
  | { kind: 'image'; data: Buffer }
  | { kind: 'video'; path: string }
  | { kind: 'none' }

export * from './reelOptions'
import type { ReelIntro, ReelOutro, ReelStyle } from './reelOptions'
import { INTRO_SECONDS } from './reelOptions'

export const NAVY = '#071530'
export const NAVY2 = '#0d2147'
export const RED = '#e31b23'
export const WHITE = '#ffffff'
export const MUTED = '#c9d0de'
export const STYLE_ACCENT: Record<ReelStyle, string> = {
  haber: RED,
  magazin: '#d81b72',
  spor: '#13a058',
  analiz: '#e0a100',
}
export const FONT_XB = 'NaHaberInterXB'
export const FONT_MD = 'NaHaberInterMD'
/**
 * Instagram / Facebook safe zones (1080×1920). Tall phones fill the screen, cropping
 * ~55px per side; the status bar + back/camera icons cover the top ~240px; the
 * username, caption and audio row cover the bottom ~400px; the like/comment/share
 * column covers x > ~920 from y ≈ 1250 down. Everything that must be read sits inside.
 */
export const SAFE = { x: 84, top: 244, bottom: 1500, right: 176 } as const
export const TICKER_Y = 1520
export const TICKER_H = 88

let fontsReady = false
export function ensureFonts(root: string): void {
  if (fontsReady) return
  const dir = path.join(root, 'src/lib/reels/assets/fonts')
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-ExtraBold.ttf'), FONT_XB)
  GlobalFonts.registerFromPath(path.join(dir, 'Inter-Medium.ttf'), FONT_MD)
  fontsReady = true
}

export type Brand = { tile: Image; mark: Image }
export async function loadBrand(root: string): Promise<Brand> {
  const dir = path.join(root, 'src/lib/reels/assets/brand')
  return {
    tile: await loadImage(await fs.readFile(path.join(dir, 'logo-tile.png'))),
    mark: await loadImage(await fs.readFile(path.join(dir, 'logo-mark.png'))),
  }
}

export function audioDir(root: string): string {
  return path.join(root, 'src/lib/reels/assets/audio/broadcast')
}

/** Bed file path for a resolved music name (null = no music). */
export function bedPath(root: string, music: string | null): string | null {
  return music ? path.join(audioDir(root), `bed-${music}.m4a`) : null
}

export async function resolveFfmpegPath(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  const mod = (await import('ffmpeg-static')) as unknown as { default?: string | null } | string
  const p = typeof mod === 'string' ? mod : mod.default
  if (!p) throw new Error('reels: ffmpeg binary not found (ffmpeg-static)')
  return p
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
/** 0→1 between a and b, eased. */
export const span = (t: number, a: number, b: number) => ease((t - a) / (b - a))

export function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Parallelogram leaning right (tag / band shape). */
export function slantPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, skew: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x + skew, y)
  ctx.lineTo(x + w + skew, y)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
}

/** drawImage with object-fit: cover + zoom/pan. */
export function drawCover(
  ctx: SKRSContext2D, img: Image | Canvas,
  dx: number, dy: number, dw: number, dh: number,
  zoom = 1, panX = 0.5, panY = 0.5,
): void {
  const s = Math.max(dw / img.width, dh / img.height) * zoom
  const sw = dw / s
  const sh = dh / s
  ctx.drawImage(img as Image, (img.width - sw) * panX, (img.height - sh) * panY, sw, sh, dx, dy, dw, dh)
}

export function wordmark(ctx: SKRSContext2D, x: number, y: number, size: number, alpha = 1): number {
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.font = `${size}px ${FONT_XB}`
  ctx.textBaseline = 'top'
  ctx.fillStyle = WHITE
  ctx.fillText('Na', x, y)
  const w = ctx.measureText('Na').width
  ctx.fillStyle = RED
  ctx.fillText('Haber', x + w, y)
  const total = ctx.measureText('NaHaber').width
  ctx.restore()
  return total
}

export function wordmarkWidth(ctx: SKRSContext2D, size: number): number {
  ctx.font = `${size}px ${FONT_XB}`
  return ctx.measureText('NaHaber').width
}

/** Slow diagonal brand bands (backgrounds). */
export function bands(ctx: SKRSContext2D, t: number, alpha: number): void {
  ctx.save()
  ctx.globalAlpha *= alpha
  const shift = (t * 36) % 600
  for (let k = -2; k < 5; k++) {
    const x = -400 + k * 600 + shift
    ctx.fillStyle = k % 2 ? 'rgba(227,27,35,0.12)' : 'rgba(255,255,255,0.03)'
    slantPath(ctx, x, 0, 160, REEL_H, 700)
    ctx.fill()
  }
  ctx.restore()
}

/** Brand background for stories without cleared media. */
export function brandBackground(ctx: SKRSContext2D, brand: Brand, t: number, p: number, accent: string, word: string): void {
  const g = ctx.createLinearGradient(0, 0, REEL_W, REEL_H)
  g.addColorStop(0, NAVY2)
  g.addColorStop(1, NAVY)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  bands(ctx, t, 1)
  const glow = ctx.createRadialGradient(REEL_W * 0.75, 560, 40, REEL_W * 0.75, 560, 900)
  glow.addColorStop(0, `${accent}55`)
  glow.addColorStop(1, `${accent}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  ctx.save()
  ctx.font = `230px ${FONT_XB}`
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.textBaseline = 'middle'
  ctx.fillText(word.toLocaleUpperCase('tr-TR'), 40 - 120 * p, 1040)
  ctx.restore()
  ctx.save()
  ctx.globalAlpha *= 0.1
  const s = 900
  ctx.translate(REEL_W * 0.62, 640)
  ctx.rotate(-0.06 + 0.04 * p)
  ctx.drawImage(brand.mark, -s / 2, -s / 2, s, s)
  ctx.restore()
}

/** Navy fades for text legibility over media. */
export function legibility(ctx: SKRSContext2D, textTop: number): void {
  const gt = ctx.createLinearGradient(0, 0, 0, SAFE.top + 330)
  gt.addColorStop(0, 'rgba(7,21,48,0.86)')
  gt.addColorStop(0.55, 'rgba(7,21,48,0.55)')
  gt.addColorStop(1, 'rgba(7,21,48,0)')
  ctx.fillStyle = gt
  ctx.fillRect(0, 0, REEL_W, SAFE.top + 330)
  const top = Math.max(560, textTop - 380)
  const gb = ctx.createLinearGradient(0, top, 0, textTop + 120)
  gb.addColorStop(0, 'rgba(7,21,48,0)')
  gb.addColorStop(1, 'rgba(7,21,48,0.94)')
  ctx.fillStyle = gb
  ctx.fillRect(0, top, REEL_W, textTop + 120 - top)
  ctx.fillStyle = 'rgba(7,21,48,0.94)'
  ctx.fillRect(0, textTop + 120, REEL_W, REEL_H - textTop - 120)
}

/** Header: logo tile + wordmark (+ optional right pill). y offset animates it in. */
export function header(ctx: SKRSContext2D, brand: Brand, y: number, rightLabel: string | null, pin = true): void {
  ctx.drawImage(brand.tile, SAFE.x, y, 92, 92)
  wordmark(ctx, SAFE.x + 110, y + 20, 50)
  if (!rightLabel) return
  ctx.font = `30px ${FONT_XB}`
  const pw = ctx.measureText(rightLabel).width
  const extra = pin ? 84 : 52
  const bx = REEL_W - SAFE.x - pw - extra
  ctx.fillStyle = 'rgba(7,21,48,0.55)'
  roundRectPath(ctx, bx, y + 18, pw + extra, 56, 28)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 2.5
  ctx.stroke()
  let tx = bx + 26
  if (pin) {
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(bx + 32, y + 40, 11, Math.PI, 0)
    ctx.lineTo(bx + 32, y + 62)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = WHITE
    ctx.beginPath()
    ctx.arc(bx + 32, y + 40, 4.5, 0, Math.PI * 2)
    ctx.fill()
    tx = bx + 56
  }
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'top'
  ctx.fillText(rightLabel, tx, y + 31)
}

/** Slanted category tag with soft chevrons; k = entrance 0..1. Returns its width. */
export function categoryTag(ctx: SKRSContext2D, label: string, x0: number, y: number, h: number, accent: string, k: number, t: number, breaking = false): number {
  ctx.font = `32px ${FONT_XB}`
  const tw = ctx.measureText(label).width
  const w = tw + 64 + (breaking ? 34 : 0)
  const x = x0 - (w + 120) * (1 - k)
  ctx.fillStyle = accent
  slantPath(ctx, x, y, w, h, 18)
  ctx.fill()
  let tx = x + 32
  if (breaking) {
    ctx.fillStyle = Math.floor(t * 2) % 2 === 0 ? WHITE : 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.arc(tx + 10, y + h / 2, 10, 0, Math.PI * 2)
    ctx.fill()
    tx += 34
  }
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  ctx.fillText(label, tx + 6, y + h / 2 + 2)
  const cx0 = x + w + 40
  for (let c = 0; c < 3; c++) {
    const a = 0.35 + 0.65 * clamp01(Math.sin((t * 2 - c * 0.5) * Math.PI) * 0.5 + 0.5)
    ctx.save()
    ctx.globalAlpha *= k * a
    ctx.strokeStyle = c % 2 ? WHITE : accent
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(cx0 + c * 28, y + 17)
    ctx.lineTo(cx0 + c * 28 + 15, y + h / 2)
    ctx.lineTo(cx0 + c * 28, y + h - 17)
    ctx.stroke()
    ctx.restore()
  }
  return w
}

/** Bottom ticker band (k = entrance 0..1). */
export function ticker(ctx: SKRSContext2D, brand: Brand, text: string, t: number, k: number, variant: 'navy' | 'red' = 'navy', y0: number = TICKER_Y): void {
  const y = y0 + (TICKER_H + 20) * (1 - k)
  ctx.fillStyle = NAVY
  ctx.fillRect(0, y, REEL_W, REEL_H - y)
  ctx.fillStyle = variant === 'red' ? RED : NAVY2
  ctx.fillRect(0, y, REEL_W, variant === 'red' ? TICKER_H + 5 : REEL_H - y)
  ctx.fillStyle = variant === 'red' ? WHITE : RED
  ctx.fillRect(0, y, REEL_W, variant === 'red' ? 0 : 5)
  ctx.save()
  ctx.beginPath()
  ctx.rect(300, y + 5, REEL_W - 300, TICKER_H)
  ctx.clip()
  ctx.font = `34px ${FONT_MD}`
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  const tw = ctx.measureText(text).width
  let x = 320 - ((t * 120) % tw)
  while (x < REEL_W) {
    ctx.fillText(text, x, y + 5 + TICKER_H / 2)
    x += tw
  }
  ctx.restore()
  ctx.fillStyle = variant === 'red' ? NAVY : RED
  slantPath(ctx, -30, y + 5, 312, TICKER_H, 26)
  ctx.fill()
  ctx.drawImage(brand.mark, SAFE.x - 8, y + 16, 62, 62)
  ctx.font = `30px ${FONT_XB}`
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  ctx.fillText('HABER', SAFE.x + 64, y + 5 + TICKER_H / 2 + 1)
}

/**
 * «Bülten» band: red slanted bar with the category + navy/white slashes, sitting on
 * the photo right above the white text panel (k = entrance 0..1).
 */
export function bulletinBand(ctx: SKRSContext2D, label: string, y: number, h: number, accent: string, k: number, t: number, breaking = false): void {
  ctx.font = `${Math.round(h * 0.6)}px ${FONT_XB}`
  const tw = ctx.measureText(label).width
  const w = SAFE.x + tw + 70 + (breaking ? 40 : 0)
  const x = -40 - (w + 200) * (1 - k)
  ctx.fillStyle = accent
  slantPath(ctx, x, y, w + 40, h, 24)
  ctx.fill()
  let tx = SAFE.x + (x + 40)
  if (breaking) {
    ctx.fillStyle = Math.floor(t * 2) % 2 === 0 ? WHITE : 'rgba(255,255,255,0.4)'
    ctx.beginPath()
    ctx.arc(tx + 12, y + h / 2, 12, 0, Math.PI * 2)
    ctx.fill()
    tx += 40
  }
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  ctx.fillText(label, tx, y + h / 2 + 2)
  // slashes
  const sx = x + w + 70
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? WHITE : NAVY
    ctx.globalAlpha *= 1
    slantPath(ctx, sx + i * 34, y + 10, 18, h - 20, 16)
    ctx.fill()
  }
  // thin navy rule along the panel top
  ctx.fillStyle = NAVY
  ctx.fillRect(0, y + h - 4, REEL_W * k, 4)
}

/** Thin top progress bar; segments > 1 draws story-style segments. */
export function progressBar(ctx: SKRSContext2D, p: number, segments = 1, active = 0, segP = 0): void {
  if (segments <= 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(0, 0, REEL_W, 8)
    ctx.fillStyle = RED
    ctx.fillRect(0, 0, REEL_W * p, 8)
    return
  }
  const gap = 10
  const w = (REEL_W - SAFE.x * 2 - gap * (segments - 1)) / segments
  for (let s = 0; s < segments; s++) {
    const x = SAFE.x + s * (w + gap)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    roundRectPath(ctx, x, SAFE.top - 34, w, 8, 4)
    ctx.fill()
    const f = s < active ? 1 : s === active ? clamp01(segP) : 0
    if (f > 0) {
      ctx.fillStyle = s === active ? RED : WHITE
      roundRectPath(ctx, x, SAFE.top - 34, Math.max(8, w * f), 8, 4)
      ctx.fill()
    }
  }
}

/**
 * Intro overlay. soft: navy + logo fades in, cross-fades out. slide: a red line
 * draws, logo slides in, the panel lifts away. minimal: nothing (header pops in).
 */
export function introOverlay(ctx: SKRSContext2D, brand: Brand, variant: ReelIntro, t: number, title?: string | null): void {
  const d = INTRO_SECONDS[variant]
  if (variant === 'minimal' || t >= d + 0.35) return
  if (variant === 'perde') {
    // two navy panels open from the centre
    const k = span(t, d - 0.4, d + 0.3)
    const half = (REEL_W / 2) * (1 - k)
    ctx.save()
    for (const side of [0, 1]) {
      ctx.save()
      const shift = REEL_W / 2 - half
      ctx.translate(side === 0 ? -shift : shift, 0)
      ctx.beginPath()
      ctx.rect(side === 0 ? 0 : REEL_W / 2, 0, REEL_W / 2, REEL_H)
      ctx.clip()
      const g0 = ctx.createLinearGradient(0, 0, 0, REEL_H)
      g0.addColorStop(0, NAVY2)
      g0.addColorStop(1, NAVY)
      ctx.fillStyle = g0
      ctx.fillRect(0, 0, REEL_W, REEL_H)
      const lk = span(t, 0.05, 0.5)
      ctx.globalAlpha *= lk
      ctx.drawImage(brand.tile, (REEL_W - 240) / 2, 700, 240, 240)
      const ww0 = wordmarkWidth(ctx, 80)
      wordmark(ctx, (REEL_W - ww0) / 2, 990, 80)
      ctx.restore()
    }
    ctx.fillStyle = RED
    if (half > 2) {
      ctx.fillRect(half - 4, 0, 4, REEL_H)
      ctx.fillRect(REEL_W - half, 0, 4, REEL_H)
    }
    ctx.restore()
    return
  }
  ctx.save()
  if (variant === 'soft') {
    ctx.globalAlpha = 1 - span(t, d - 0.3, d + 0.25)
  } else if (variant === 'zoom') {
    ctx.globalAlpha = 1 - span(t, d - 0.25, d + 0.25)
  } else {
    ctx.translate(0, -REEL_H * span(t, d - 0.35, d + 0.3))
  }
  const g = ctx.createLinearGradient(0, 0, 0, REEL_H)
  g.addColorStop(0, NAVY2)
  g.addColorStop(1, NAVY)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  const glow = ctx.createRadialGradient(REEL_W / 2, 860, 20, REEL_W / 2, 860, 700)
  glow.addColorStop(0, 'rgba(227,27,35,0.22)')
  glow.addColorStop(1, 'rgba(227,27,35,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  const s = 260
  if (variant === 'zoom') {
    const k = span(t, 0.0, 0.6)
    const out = span(t, d - 0.3, d + 0.3)
    const sc = (0.45 + 0.55 * k) * (1 + 1.6 * out)
    ctx.drawImage(brand.tile, (REEL_W - s * sc) / 2, 820 - (s * sc) / 2, s * sc, s * sc)
    const ww = wordmarkWidth(ctx, 84)
    wordmark(ctx, (REEL_W - ww) / 2, 1020, 84, span(t, 0.35, 0.7) * (1 - out))
  } else if (variant === 'soft') {
    const k = span(t, 0.05, 0.55)
    const sc = 0.9 + 0.1 * k
    ctx.save()
    ctx.globalAlpha *= k
    ctx.drawImage(brand.tile, (REEL_W - s * sc) / 2, 720 - (s * sc) / 2 + s / 2 - s / 2, s * sc, s * sc)
    ctx.restore()
    const ww = wordmarkWidth(ctx, 84)
    wordmark(ctx, (REEL_W - ww) / 2, 1020 + 16 * (1 - span(t, 0.3, 0.7)), 84, span(t, 0.3, 0.7))
  } else {
    const lk = span(t, 0.0, 0.4)
    ctx.fillStyle = RED
    ctx.fillRect(0, 1000, REEL_W * lk, 6)
    const k = span(t, 0.12, 0.55)
    const x = (REEL_W - s) / 2 - 700 * (1 - k)
    ctx.save()
    ctx.globalAlpha *= k
    ctx.drawImage(brand.tile, x, 680, s, s)
    const ww = wordmarkWidth(ctx, 84)
    wordmark(ctx, (REEL_W - ww) / 2 + 700 * (1 - k), 1040, 84)
    ctx.restore()
  }
  if (title) {
    ctx.save()
    ctx.globalAlpha *= span(t, 0.4, 0.8)
    ctx.font = `40px ${FONT_XB}`
    ctx.fillStyle = MUTED
    ctx.textBaseline = 'top'
    ctx.fillText(title, (REEL_W - ctx.measureText(title).width) / 2, 1160)
    ctx.restore()
  }
  ctx.restore()
}

/** End card: soft cross-fade (or lift-in for slide). et = seconds since endStart. */
export function endCard(ctx: SKRSContext2D, brand: Brand, variant: ReelIntro, et: number, t: number, cta = 'Haberin tamamı', outro: ReelOutro = 'logo'): void {
  if (et < -0.35) return
  ctx.save()
  if (variant === 'slide') ctx.translate(0, REEL_H * (1 - span(et, -0.35, 0.25)))
  else ctx.globalAlpha = span(et, -0.35, 0.2)
  if (outro === 'short') {
    const g1 = ctx.createLinearGradient(0, 0, 0, REEL_H)
    g1.addColorStop(0, NAVY2)
    g1.addColorStop(1, NAVY)
    ctx.fillStyle = g1
    ctx.fillRect(0, 0, REEL_W, REEL_H)
    const k1 = span(et, 0, 0.35)
    ctx.save()
    ctx.globalAlpha *= k1
    ctx.drawImage(brand.tile, (REEL_W - 200) / 2, 760, 200, 200)
    ctx.font = `44px ${FONT_XB}`
    ctx.fillStyle = WHITE
    ctx.textBaseline = 'top'
    const u = 'nahaber.com'
    ctx.fillText(u, (REEL_W - ctx.measureText(u).width) / 2, 1000)
    ctx.restore()
    ctx.restore()
    return
  }
  const g = ctx.createLinearGradient(0, 0, 0, REEL_H)
  g.addColorStop(0, NAVY2)
  g.addColorStop(1, NAVY)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, REEL_W, REEL_H)
  bands(ctx, t, 0.8)
  const k = span(et, 0.0, 0.5)
  const s = 270 * (0.9 + 0.1 * k)
  ctx.save()
  ctx.globalAlpha *= k
  ctx.shadowColor = 'rgba(227,27,35,0.5)'
  ctx.shadowBlur = 60
  ctx.drawImage(brand.tile, (REEL_W - s) / 2, 735 - s / 2, s, s)
  ctx.restore()
  const ww = wordmarkWidth(ctx, 92)
  wordmark(ctx, (REEL_W - ww) / 2, 940, 92, span(et, 0.15, 0.5))
  ctx.save()
  ctx.globalAlpha *= span(et, 0.35, 0.75)
  ctx.font = `40px ${FONT_MD}`
  ctx.fillStyle = MUTED
  ctx.textBaseline = 'top'
  ctx.fillText(cta, (REEL_W - ctx.measureText(cta).width) / 2, 1085)
  ctx.font = `46px ${FONT_XB}`
  const url = 'nahaber.com'
  const uw = ctx.measureText(url).width
  ctx.fillStyle = RED
  roundRectPath(ctx, (REEL_W - uw) / 2 - 48, 1155, uw + 96, 92, 46)
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.fillText(url, (REEL_W - uw) / 2, 1178)
  if (outro === 'follow') {
    const fk = span(et, 0.6, 1.0)
    const pulse = 1 + 0.03 * Math.sin(et * 6)
    ctx.save()
    ctx.globalAlpha *= fk
    ctx.font = `44px ${FONT_XB}`
    const lbl = 'Takip et  ·  @nahaber_com'
    const lw = ctx.measureText(lbl).width
    ctx.translate(REEL_W / 2, 1345)
    ctx.scale(pulse, pulse)
    ctx.fillStyle = WHITE
    roundRectPath(ctx, -lw / 2 - 44, -46, lw + 88, 92, 46)
    ctx.fill()
    ctx.fillStyle = NAVY
    ctx.textBaseline = 'middle'
    ctx.fillText(lbl, -lw / 2, 2)
    ctx.restore()
    ctx.font = `30px ${FONT_MD}`
    ctx.fillStyle = MUTED
    const n2 = 'Bildirimleri aç, gündemi kaçırma'
    ctx.fillText(n2, (REEL_W - ctx.measureText(n2).width) / 2, 1430)
  } else {
    ctx.font = `34px ${FONT_MD}`
    ctx.fillStyle = MUTED
    const f = 'Gündemi kaçırma — takip et'
    ctx.fillText(f, (REEL_W - ctx.measureText(f).width) / 2, 1305)
  }
  ctx.restore()
  ctx.restore()
}

/** Per-frame voice level (0..1) for the presenter ring. */
export function voiceEnvelope(pcm: { sampleRate: number; data: Float32Array }, offsetSec: number, frames: number, fps: number): Float32Array {
  const out = new Float32Array(frames)
  const win = Math.round(pcm.sampleRate / fps)
  let peak = 1e-6
  for (let f = 0; f < frames; f++) {
    const start = Math.round((f / fps - offsetSec) * pcm.sampleRate)
    if (start < 0 || start >= pcm.data.length) continue
    let sum = 0
    const end = Math.min(pcm.data.length, start + win)
    for (let i = start; i < end; i++) sum += pcm.data[i]! * pcm.data[i]!
    out[f] = Math.sqrt(sum / Math.max(1, end - start))
    peak = Math.max(peak, out[f]!)
  }
  for (let f = 0; f < frames; f++) out[f] = Math.min(1, out[f]! / peak)
  return out
}

/** Presenter chip: round photo (or initial) with a ring that follows the voice level. */
export function presenterCard(ctx: SKRSContext2D, p: { name: string; title?: string | null }, photo: Image | null, accent: string, x: number, y: number, level: number, k: number): void {
  if (k <= 0) return
  ctx.save()
  ctx.globalAlpha *= k
  const r = 40
  const cx = x + r
  const cy = y + r
  ctx.font = `30px ${FONT_XB}`
  const nw = ctx.measureText(p.name).width
  ctx.font = `22px ${FONT_MD}`
  const tw = p.title ? ctx.measureText(p.title).width : 0
  const w = r * 2 + 28 + Math.max(nw, tw) + 30
  ctx.fillStyle = 'rgba(7,21,48,0.72)'
  roundRectPath(ctx, x - 8, y - 8, w, r * 2 + 16, r + 8)
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = 4 + 8 * level
  ctx.globalAlpha *= 0.6 + 0.4 * level
  ctx.beginPath()
  ctx.arc(cx, cy, r + 4 + 6 * level, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = k
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (photo) drawCover(ctx, photo, cx - r, cy - r, r * 2, r * 2)
  else {
    ctx.fillStyle = accent
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.font = `40px ${FONT_XB}`
    ctx.fillStyle = WHITE
    ctx.textBaseline = 'middle'
    const ini = p.name.charAt(0).toLocaleUpperCase('tr-TR')
    ctx.fillText(ini, cx - ctx.measureText(ini).width / 2, cy + 2)
  }
  ctx.restore()
  ctx.textBaseline = 'top'
  ctx.font = `30px ${FONT_XB}`
  ctx.fillStyle = WHITE
  ctx.fillText(p.name, x + r * 2 + 22, y + (p.title ? 10 : 24))
  if (p.title) {
    ctx.font = `22px ${FONT_MD}`
    ctx.fillStyle = MUTED
    ctx.fillText(p.title, x + r * 2 + 22, y + 46)
  }
  ctx.restore()
}

/** Decode a video into full-frame RGBA frames (looped when short). */
export async function* videoFrames(ffmpeg: string, file: string, n: number, w = REEL_W, h = REEL_H): AsyncGenerator<Uint8Array> {
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

export function writeFrame(stdin: NodeJS.WritableStream, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (stdin.write(data)) return resolve()
    const onDrain = () => { stdin.off('error', onError); resolve() }
    const onError = (err: Error) => { stdin.off('drain', onDrain); reject(err) }
    stdin.once('drain', onDrain)
    stdin.once('error', onError)
  })
}

/** Spawn the H.264/AAC encoder: stdin = RGBA frames, voice + looped bed + fx mixed by `filter`. */
export function spawnEncoder(ffmpeg: string, a: { voice: string; bed: string | null; fx: string; filter: string; total: number; out: string }) {
  const enc = spawn(ffmpeg, [
    '-v', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${REEL_W}x${REEL_H}`, '-r', String(REEL_FPS), '-i', '-',
    '-i', a.voice,
    ...(a.bed ? ['-stream_loop', '-1', '-i', a.bed] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono']),
    '-i', a.fx,
    '-filter_complex', a.filter,
    '-map', '0:v', '-map', '[a]', '-t', a.total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', a.out,
  ], { stdio: ['pipe', 'ignore', 'pipe'] })
  enc.stdin!.on('error', () => {})
  let err = ''
  enc.stderr!.on('data', (d) => { err += String(d) })
  const done = new Promise<number>((resolve) => enc.on('close', (code) => resolve(code ?? 1)))
  return {
    async frame(canvas: Canvas) {
      try {
        await writeFrame(enc.stdin!, canvas.data())
      } catch (e) {
        const c = await done
        throw new Error(`reels: ffmpeg stopped (${c}): ${err.slice(-400) || (e as Error).message}`)
      }
    },
    async finish() {
      enc.stdin!.end()
      const code = await done
      if (code !== 0) throw new Error(`reels: ffmpeg failed (${code}): ${err.slice(-400)}`)
    },
  }
}

export function newCanvas(): { canvas: Canvas; ctx: SKRSContext2D } {
  const canvas = createCanvas(REEL_W, REEL_H)
  return { canvas, ctx: canvas.getContext('2d') }
}
