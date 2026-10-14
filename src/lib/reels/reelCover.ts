import 'server-only'

/**
 * REELS-5 — NaHaber reel cover (1080×1920 JPEG) for the Instagram grid / Reels tab.
 * Instagram shows the cover 9:16 in the Reels tab and crops it to the centre 3:4
 * (y 240…1680) on the profile grid, so the logo, tag and headline all sit inside
 * that band. Looks: «manset» (photo full-bleed, big headline), «panel» (photo in a
 * rounded card on navy) and «bulten» (photo on top, white panel — same as the post card).
 * All text starts at the left margin (REELS-6).
 */
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { REEL_H, REEL_W, wrapLines } from './timeline'
import {
  FONT_MD, FONT_XB, MUTED, NAVY, NAVY2, RED, STYLE_ACCENT, WHITE,
  brandBackground, drawCover, ensureFonts, loadBrand, roundRectPath, slantPath, wordmark, wordmarkWidth,
  type Brand, type ReelStyle,
} from './reelTheme'

export type ReelCoverVariant = 'manset' | 'panel' | 'bulten'
export const REEL_COVER_VARIANTS: ReadonlyArray<{ id: ReelCoverVariant; label: string }> = [
  { id: 'manset', label: 'Manşet' },
  { id: 'panel', label: 'Panel' },
  { id: 'bulten', label: 'Bülten' },
]
export function isReelCoverVariant(v: unknown): v is ReelCoverVariant {
  return v === 'manset' || v === 'panel' || v === 'bulten'
}

export type ReelCoverInput = {
  headline: string
  category: string
  place?: string | null
  style?: ReelStyle
  breaking?: boolean
  summary?: string | null
  /** Image bytes (a video's frame is grabbed by the caller). */
  image?: Buffer | null
  variant?: ReelCoverVariant
}

/** Grid crop band (centre 3:4). */
const GRID_TOP = 240
const GRID_BOTTOM = 1680

function logoRow(ctx: SKRSContext2D, brand: Brand, y: number, size = 92, pill = false): void {
  const ws = Math.round(size * 0.6)
  const ww = wordmarkWidth(ctx, ws)
  const w = size + 20 + ww
  const x = LEFT
  if (pill) {
    ctx.fillStyle = 'rgba(7,21,48,0.72)'
    roundRectPath(ctx, x - 14, y - 14, w + 46, size + 28, (size + 28) / 2)
    ctx.fill()
  }
  ctx.drawImage(brand.tile, x, y, size, size)
  wordmark(ctx, x + size + 20, y + (size - ws) / 2 - 2, ws)
}

const LEFT = 84
function tag(ctx: SKRSContext2D, label: string, x0: number, y: number, accent: string): number {
  ctx.font = `36px ${FONT_XB}`
  const tw = ctx.measureText(label).width
  const w = tw + 70
  const h = 70
  ctx.fillStyle = accent
  slantPath(ctx, x0 - 34, y, w, h, 20)
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x0, y + h / 2 + 2)
  return h
}

function place(ctx: SKRSContext2D, label: string, x0: number, y: number): void {
  ctx.font = `34px ${FONT_XB}`
  const tw = ctx.measureText(label).width
  const x = x0
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(x + 12, y + 14, 12, Math.PI, 0)
  ctx.lineTo(x + 12, y + 38)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.arc(x + 12, y + 14, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = MUTED
  ctx.textBaseline = 'top'
  ctx.fillText(label, x + 40, y + 2)
}

function footer(ctx: SKRSContext2D): void {
  ctx.fillStyle = RED
  ctx.fillRect(LEFT, GRID_BOTTOM - 92, 120, 6)
  ctx.font = `30px ${FONT_MD}`
  ctx.fillStyle = MUTED
  ctx.textBaseline = 'top'
  const u = 'nahaber.com'
  ctx.fillText(u, LEFT, GRID_BOTTOM - 70)
}

/** Centred headline lines; returns the block height. */
function headline(ctx: SKRSContext2D, lines: string[], y: number, size: number, lh: number): void {
  ctx.font = `${size}px ${FONT_XB}`
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 18
  lines.forEach((l, i) => ctx.fillText(l, LEFT, y + i * lh))
  ctx.shadowBlur = 0
}

/** Pick the largest size (≤ max) that fits the headline in `maxLines`. */
function fitHeadline(ctx: SKRSContext2D, text: string, width: number, maxLines: number, sizes: number[]): { lines: string[]; size: number; lh: number } {
  for (const size of sizes) {
    ctx.font = `${size}px ${FONT_XB}`
    const all = wrapLines((s) => ctx.measureText(s).width, text, width)
    if (all.length <= maxLines) return { lines: all, size, lh: Math.round(size * 1.14) }
  }
  const size = sizes[sizes.length - 1]!
  ctx.font = `${size}px ${FONT_XB}`
  return { lines: wrapLines((s) => ctx.measureText(s).width, text, width, maxLines), size, lh: Math.round(size * 1.14) }
}

export async function renderReelCover(input: ReelCoverInput, opts: { root?: string } = {}): Promise<Buffer> {
  const root = opts.root ?? process.cwd()
  ensureFonts(root)
  const brand = await loadBrand(root)
  const variant: ReelCoverVariant = input.variant ?? 'manset'
  if (variant === 'bulten') {
    const { renderBulletinCard } = await import('./bulletinCard')
    return renderBulletinCard({ headline: input.headline, category: input.category, place: input.place, style: input.style, breaking: input.breaking, image: input.image, summary: input.summary }, 'story', opts)
  }
  const accent = input.breaking ? RED : STYLE_ACCENT[input.style ?? 'haber']
  const cat = (input.breaking ? 'SON DAKİKA' : input.category).toLocaleUpperCase('tr-TR')
  const placeLabel = input.place ? input.place.toLocaleUpperCase('tr-TR') : null
  let img: Image | null = null
  if (input.image) img = await loadImage(input.image).catch(() => null)

  const canvas = createCanvas(REEL_W, REEL_H)
  const ctx = canvas.getContext('2d')
  const cx = LEFT

  if (variant === 'panel') {
    const g = ctx.createLinearGradient(0, 0, 0, REEL_H)
    g.addColorStop(0, NAVY2)
    g.addColorStop(1, NAVY)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, REEL_W, REEL_H)
    logoRow(ctx, brand, GRID_TOP + 40, 84)
    const fit = fitHeadline(ctx, input.headline, REEL_W - LEFT * 2, 4, [84, 76, 68])
    const blockH = 70 + 34 + fit.lines.length * fit.lh + (placeLabel ? 24 + 44 : 0)
    const tagY = GRID_BOTTOM - 120 - blockH
    const card = { x: 64, y: GRID_TOP + 160, w: REEL_W - 128, h: Math.max(360, tagY - 50 - (GRID_TOP + 160)) }
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 36
    ctx.shadowOffsetY = 10
    roundRectPath(ctx, card.x, card.y, card.w, card.h, 34)
    ctx.fillStyle = '#000'
    ctx.fill()
    ctx.restore()
    ctx.save()
    roundRectPath(ctx, card.x, card.y, card.w, card.h, 34)
    ctx.clip()
    if (img) drawCover(ctx, img, card.x, card.y, card.w, card.h, 1.02, 0.5, 0.45)
    else brandBackground(ctx, brand, 0, 0, accent, input.category)
    ctx.restore()
    tag(ctx, cat, cx, tagY, accent)
    headline(ctx, fit.lines, tagY + 70 + 34, fit.size, fit.lh)
    if (placeLabel) place(ctx, placeLabel, cx, tagY + 70 + 34 + fit.lines.length * fit.lh + 24)
    footer(ctx)
  } else {
    if (img) drawCover(ctx, img, 0, 0, REEL_W, REEL_H, 1.0, 0.5, 0.42)
    else brandBackground(ctx, brand, 0, 0, accent, input.category)
    const gt = ctx.createLinearGradient(0, 0, 0, GRID_TOP + 300)
    gt.addColorStop(0, 'rgba(7,21,48,0.88)')
    gt.addColorStop(1, 'rgba(7,21,48,0)')
    ctx.fillStyle = gt
    ctx.fillRect(0, 0, REEL_W, GRID_TOP + 300)
    const fit = fitHeadline(ctx, input.headline, REEL_W - LEFT * 2, 4, [104, 94, 86, 78, 70])
    const blockH = 70 + 36 + fit.lines.length * fit.lh + (placeLabel ? 26 + 44 : 0)
    const tagY = GRID_BOTTOM - 130 - blockH
    const gb = ctx.createLinearGradient(0, tagY - 360, 0, tagY + 120)
    gb.addColorStop(0, 'rgba(7,21,48,0)')
    gb.addColorStop(1, 'rgba(7,21,48,0.94)')
    ctx.fillStyle = gb
    ctx.fillRect(0, tagY - 360, REEL_W, 480)
    ctx.fillStyle = 'rgba(7,21,48,0.94)'
    ctx.fillRect(0, tagY + 120, REEL_W, REEL_H - tagY - 120)
    ctx.fillStyle = RED
    ctx.fillRect(0, 0, REEL_W, 10)
    logoRow(ctx, brand, GRID_TOP + 40, 88, true)
    tag(ctx, cat, cx, tagY, accent)
    headline(ctx, fit.lines, tagY + 70 + 36, fit.size, fit.lh)
    if (placeLabel) place(ctx, placeLabel, cx, tagY + 70 + 36 + fit.lines.length * fit.lh + 26)
    footer(ctx)
  }
  return canvas.encode('jpeg', 90)
}
