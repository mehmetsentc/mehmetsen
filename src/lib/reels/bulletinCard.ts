import 'server-only'

/**
 * REELS-6 — «Bülten» still card in the reel theme: photo on top, red category band
 * with slashes, white panel with a left-aligned navy headline + summary, red footer.
 *   post  : 1080×1350 (Instagram / Facebook feed, 4:5)
 *   story : 1080×1920 (image story / reel cover; content kept inside the grid's 3:4 band)
 */
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { wrapLines } from './timeline'
import {
  FONT_MD, FONT_XB, NAVY, RED, STYLE_ACCENT, WHITE,
  brandBackground, drawCover, ensureFonts, loadBrand, roundRectPath, slantPath, wordmark, wordmarkWidth,
  type Brand, type ReelStyle,
} from './reelTheme'

export type BulletinFormat = 'post' | 'story'
export type BulletinCardInput = {
  headline: string
  summary?: string | null
  category: string
  place?: string | null
  style?: ReelStyle
  breaking?: boolean
  image?: Buffer | null
  dateLabel?: string | null
}

type Geo = { W: number; H: number; x: number; right: number; logoY: number; bottom: number; head: number[]; sum: number; band: number }
const GEO: Record<BulletinFormat, Geo> = {
  post: { W: 1080, H: 1350, x: 72, right: 72, logoY: 44, bottom: 1350, head: [66, 60, 54], sum: 32, band: 76 },
  story: { W: 1080, H: 1920, x: 84, right: 84, logoY: 270, bottom: 1680, head: [72, 66, 60], sum: 34, band: 80 },
}

export function logoPill(ctx: SKRSContext2D, brand: Brand, x: number, y: number): void {
  const size = 72
  const ws = 44
  const w = size + 16 + wordmarkWidth(ctx, ws) + 30
  ctx.fillStyle = 'rgba(7,21,48,0.78)'
  roundRectPath(ctx, x - 10, y - 10, w + 10, size + 20, (size + 20) / 2)
  ctx.fill()
  ctx.drawImage(brand.tile, x, y, size, size)
  wordmark(ctx, x + size + 16, y + (size - ws) / 2 - 2, ws)
}

export function placePill(ctx: SKRSContext2D, label: string, right: number, y: number): void {
  ctx.font = `30px ${FONT_XB}`
  const tw = ctx.measureText(label).width
  const w = tw + 80
  const x = right - w
  ctx.fillStyle = 'rgba(7,21,48,0.78)'
  roundRectPath(ctx, x, y, w, 60, 30)
  ctx.fill()
  ctx.fillStyle = RED
  ctx.beginPath()
  ctx.arc(x + 30, y + 24, 11, Math.PI, 0)
  ctx.lineTo(x + 30, y + 46)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = WHITE
  ctx.beginPath()
  ctx.arc(x + 30, y + 24, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + 54, y + 31)
}

function band(ctx: SKRSContext2D, label: string, x0: number, y: number, h: number, accent: string, breaking: boolean): void {
  ctx.font = `${Math.round(h * 0.56)}px ${FONT_XB}`
  const tw = ctx.measureText(label).width
  const w = x0 + tw + 60 + (breaking ? 40 : 0)
  ctx.fillStyle = accent
  slantPath(ctx, -40, y, w + 40, h, 24)
  ctx.fill()
  let tx = x0
  if (breaking) {
    ctx.fillStyle = WHITE
    ctx.beginPath()
    ctx.arc(tx + 12, y + h / 2, 12, 0, Math.PI * 2)
    ctx.fill()
    tx += 40
  }
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  ctx.fillText(label, tx, y + h / 2 + 2)
  const sx = w + 30
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? WHITE : NAVY
    slantPath(ctx, sx + i * 34, y + 10, 18, h - 20, 16)
    ctx.fill()
  }
  ctx.fillStyle = NAVY
  ctx.fillRect(0, y + h - 4, 10_000, 4)
}

function fit(ctx: SKRSContext2D, text: string, width: number, sizes: number[], maxLines: number) {
  for (const size of sizes) {
    ctx.font = `${size}px ${FONT_XB}`
    const lines = wrapLines((s) => ctx.measureText(s).width, text, width)
    if (lines.length <= maxLines) return { lines, size, lh: Math.round(size * 1.16) }
  }
  const size = sizes[sizes.length - 1]!
  ctx.font = `${size}px ${FONT_XB}`
  return { lines: wrapLines((s) => ctx.measureText(s).width, text, width, maxLines), size, lh: Math.round(size * 1.16) }
}

export async function renderBulletinCard(input: BulletinCardInput, format: BulletinFormat, opts: { root?: string } = {}): Promise<Buffer> {
  const root = opts.root ?? process.cwd()
  ensureFonts(root)
  const brand = await loadBrand(root)
  const g = GEO[format]
  const accent = input.breaking ? RED : STYLE_ACCENT[input.style ?? 'haber']
  const cat = (input.breaking ? 'SON DAKİKA' : input.category).toLocaleUpperCase('tr-TR')
  let img: Image | null = null
  if (input.image) img = await loadImage(input.image).catch(() => null)

  const canvas = createCanvas(g.W, g.H)
  const ctx = canvas.getContext('2d')
  const textW = g.W - g.x - g.right
  const head = fit(ctx, input.headline, textW, g.head, 4)
  ctx.font = `${g.sum}px ${FONT_MD}`
  const sumLines = input.summary ? wrapLines((s) => ctx.measureText(s).width, input.summary, textW, 2) : []
  const sumLh = Math.round(g.sum * 1.36)
  // Red footer is always the last row (no empty band under it). On the 9:16 story/cover the
  // text still sits inside the profile grid's 3:4 crop (y ≤ g.bottom); the white panel
  // simply runs down to the footer.
  const footH = format === 'post' ? 88 : 96
  const footY = g.H - footH
  const textH = 40 + head.lines.length * head.lh + (sumLines.length ? 16 + sumLines.length * sumLh : 0) + 34
  const panelTop = Math.min(footY, g.bottom) - textH
  const bandY = panelTop - g.band

  // photo
  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, g.W, g.H)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, g.W, panelTop)
  ctx.clip()
  if (img) drawCover(ctx, img, 0, 0, g.W, panelTop, 1.0, 0.5, 0.42)
  else brandBackground(ctx, brand, 0, 0, accent, input.category)
  ctx.restore()
  // clean top: no logo / city pills (brand lives in the footer)

  // panel + text
  ctx.fillStyle = WHITE
  ctx.fillRect(0, panelTop, g.W, footY - panelTop)
  band(ctx, cat, g.x, bandY, g.band, accent, !!input.breaking)
  ctx.font = `${head.size}px ${FONT_XB}`
  ctx.fillStyle = NAVY
  ctx.textBaseline = 'top'
  head.lines.forEach((l, i) => ctx.fillText(l, g.x, panelTop + 40 + i * head.lh))
  if (sumLines.length) {
    ctx.font = `${g.sum}px ${FONT_MD}`
    ctx.fillStyle = '#4a5468'
    const sy = panelTop + 40 + head.lines.length * head.lh + 16
    sumLines.forEach((l, i) => ctx.fillText(l, g.x, sy + i * sumLh))
  }

  // footer: red strip, navy badge with the mark, site + date
  ctx.fillStyle = RED
  ctx.fillRect(0, footY, g.W, footH)
  ctx.fillStyle = NAVY
  slantPath(ctx, -30, footY, g.x + 250, footH, 24)
  ctx.fill()
  ctx.drawImage(brand.mark, g.x - 6, footY + (footH - 58) / 2, 58, 58)
  ctx.font = `30px ${FONT_XB}`
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'middle'
  ctx.fillText('HABER', g.x + 62, footY + footH / 2 + 1)
  ctx.font = `30px ${FONT_MD}`
  const right = `nahaber.com${input.dateLabel ? `  •  ${input.dateLabel}` : ''}`
  ctx.fillText(right, g.W - g.right - ctx.measureText(right).width, footY + footH / 2 + 1)
  return canvas.encode('jpeg', 90)
}
