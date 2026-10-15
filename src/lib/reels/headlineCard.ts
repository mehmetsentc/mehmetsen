import 'server-only'

/**
 * REELS-8 — «Foto» still card: the story's photo full-bleed, the transparent NaHaber logo
 * top-left, a category row (outlined category box + red SON DAKİKA box + thin rule),
 * a big upper-case left-aligned headline and a short summary under it.
 *   post  : 1080×1350 (Instagram / Facebook feed, 4:5)
 *   story : 1080×1920 (image story and reel cover; logo + text kept inside the profile
 *           grid's centre 3:4 band y 240…1680 and above Instagram's bottom UI)
 */
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { wrapLines } from './timeline'
import {
  FONT_MD, FONT_XB, NAVY, RED, WHITE,
  brandBackground, drawCover, ensureFonts, loadBrand, wordmark,
  type Brand, type ReelStyle,
} from './reelTheme'

export type HeadlineCardFormat = 'post' | 'story'
export type HeadlineCardInput = {
  headline: string
  summary?: string | null
  category: string
  place?: string | null
  style?: ReelStyle
  breaking?: boolean
  image?: Buffer | null
}

export type Geo = {
  W: number; H: number; x: number; textW: number; logoY: number; logo: number; bottom: number
  /** headline sizes, largest first; `comfy` = smallest size tried before a summary sentence is dropped */
  head: number[]; comfy: number; sum: number[]; sumLines: number; tagH: number
}
const GEO: Record<HeadlineCardFormat, Geo> = {
  post: { W: 1080, H: 1350, x: 72, textW: 820, logoY: 60, logo: 1, bottom: 1290, head: [44, 42, 40, 38, 36, 34], comfy: 38, sum: [29, 27, 26], sumLines: 4, tagH: 50 },
  story: { W: 1080, H: 1920, x: 84, textW: 820, logoY: 270, logo: 1.05, bottom: 1640, head: [47, 45, 43, 41, 39, 37], comfy: 41, sum: [31, 29, 27], sumLines: 5, tagH: 52 },
}
const HEAD_MAX_LINES = 5
const TAG_GAP = 30
const SUM_GAP = 26

/** Transparent logo: mark + «Na»«Haber» wordmark, soft shadow only. */
function logo(ctx: SKRSContext2D, brand: Brand, x: number, y: number, k: number): void {
  const size = Math.round(78 * k)
  const ws = Math.round(50 * k)
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 2
  ctx.drawImage(brand.mark, x, y, size, size)
  wordmark(ctx, x + size + 12 * k, y + (size - ws) / 2 - 2, ws)
  ctx.restore()
}

/** Outlined category box, red SON DAKİKA box, thin rule to the right. */
function tagRow(ctx: SKRSContext2D, cat: string, breaking: boolean, x: number, y: number, h: number, ruleEnd: number): void {
  ctx.font = `${Math.round(h * 0.5)}px ${FONT_XB}`
  ctx.textBaseline = 'middle'
  const pad = Math.round(h * 0.36)
  let cx = x
  const cw = ctx.measureText(cat).width + pad * 2
  ctx.fillStyle = 'rgba(7,21,48,0.35)'
  ctx.fillRect(cx, y, cw, h)
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 3
  ctx.strokeRect(cx + 1.5, y + 1.5, cw - 3, h - 3)
  ctx.fillStyle = WHITE
  ctx.fillText(cat, cx + pad, y + h / 2 + 1)
  cx += cw
  if (breaking) {
    const label = 'SON DAKİKA'
    const bw = ctx.measureText(label).width + pad * 2
    ctx.fillStyle = RED
    ctx.fillRect(cx, y, bw, h)
    ctx.fillStyle = WHITE
    ctx.fillText(label, cx + pad, y + h / 2 + 1)
    cx += bw
  }
  if (ruleEnd - cx > 80) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(cx + 22, y + h / 2 - 1, ruleEnd - cx - 22, 2)
  }
}

/**
 * Even line breaks: keep the line count of a normal wrap but use the narrowest width
 * that still gives it, so lines come out similar in length (no lone last word).
 */
export function balance(measure: (font: string, s: string) => number, font: string, text: string, width: number): string[] {
  const m = (s: string) => measure(font, s)
  const base = wrapLines(m, text, width)
  if (base.length < 2) return base
  let lo = Math.floor(width * 0.55)
  let hi = width
  while (hi - lo > 4) {
    const mid = Math.floor((lo + hi) / 2)
    if (wrapLines(m, text, mid).length <= base.length) hi = mid
    else lo = mid
  }
  const lines = wrapLines(m, text, hi)
  return lines.length === base.length && lines.every((l) => m(l) <= width) ? lines : base
}

/** Whole sentences of the summary, longest prefix first (never cut inside a sentence). */
export function summaryOptions(summary: string | null | undefined): string[] {
  const t = (summary ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return []
  // split only at a space after . ! ? … when the next word starts a sentence (keeps «06.00», «3.5»)
  const parts = t.split(/(?<=[.!?…]["'”’)]*)\s+(?=["“‘'(]?[A-ZÇĞİÖŞÜ0-9])/).map((x) => x.trim()).filter(Boolean)
  const out: string[] = []
  for (let n = parts.length; n >= 1; n--) out.push(parts.slice(0, n).join(' '))
  return out
}

type Layout = { head: string[]; headSize: number; headLh: number; sum: string[]; sumSize: number; sumLh: number; blockH: number }

/**
 * Full headline + as much of the summary as fits, in whole sentences. The headline is
 * never shortened: its size steps down until every line fits the width and the block
 * fits between the logo and the bottom margin. Text never ends in «…».
 */
export function layoutText(measure: (font: string, s: string) => number, headline: string, summary: string | null | undefined, g: Geo, avail: number): Layout {
  const wrap = (font: string, text: string) => wrapLines((s) => measure(font, s), text, g.textW)
  const fitsW = (font: string, lines: string[]) => lines.every((l) => measure(font, l) <= g.textW)
  const opts = [...summaryOptions(summary), '']
  let fallback: Layout | null = null
  for (const sizes of [g.head.filter((z) => z >= g.comfy), g.head]) {
    for (const opt of opts) {
      for (const sumSize of opt ? g.sum : [g.sum[0]!]) {
        const sf = `${sumSize}px ${FONT_MD}`
        const sum = opt ? wrap(sf, opt) : []
        if (sum.length > g.sumLines) continue
        const sumLh = Math.round(sumSize * 1.38)
        const sumH = sum.length ? SUM_GAP + sum.length * sumLh : 0
        for (const headSize of sizes) {
          const hf = `${headSize}px ${FONT_XB}`
          const head = balance(measure, hf, headline, g.textW)
          const headLh = Math.round(headSize * 1.3)
          const blockH = g.tagH + TAG_GAP + head.length * headLh + sumH
          const l = { head, headSize, headLh, sum, sumSize, sumLh, blockH }
          if (!fallback || blockH < fallback.blockH) fallback = l
          if (head.length <= HEAD_MAX_LINES && fitsW(hf, head) && blockH <= avail) return l
        }
      }
    }
  }
  return fallback!
}

export async function renderHeadlineCard(input: HeadlineCardInput, format: HeadlineCardFormat, opts: { root?: string } = {}): Promise<Buffer> {
  const root = opts.root ?? process.cwd()
  ensureFonts(root)
  const brand = await loadBrand(root)
  const g = GEO[format]
  const breaking = !!input.breaking
  const rawCat = (input.category || 'Gündem').trim()
  const cat = (/^son dakika$/i.test(rawCat) ? 'Gündem' : rawCat).toLocaleUpperCase('tr-TR')
  let img: Image | null = null
  if (input.image) img = await loadImage(input.image).catch(() => null)

  const canvas = createCanvas(g.W, g.H)
  const ctx = canvas.getContext('2d')
  const headText = input.headline.trim().toLocaleUpperCase('tr-TR')
  const measure = (font: string, t: string) => {
    ctx.font = font
    return ctx.measureText(t).width
  }
  const avail = g.bottom - (g.logoY + Math.round(78 * g.logo) + 70)
  const L = layoutText(measure, headText, input.summary, g, avail)
  const top = g.bottom - L.blockH

  // photo
  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, g.W, g.H)
  if (img) drawCover(ctx, img, 0, 0, g.W, g.H, 1.0, 0.5, 0.4)
  else brandBackground(ctx, brand, 0, 0, RED, input.category)
  // legibility: soft top shade for the logo, deep bottom shade for the text
  const gt = ctx.createLinearGradient(0, 0, 0, g.logoY + 260)
  gt.addColorStop(0, 'rgba(0,0,0,0.45)')
  gt.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gt
  ctx.fillRect(0, 0, g.W, g.logoY + 260)
  const fadeTop = Math.max(0, top - 420)
  const gb = ctx.createLinearGradient(0, fadeTop, 0, g.H)
  gb.addColorStop(0, 'rgba(0,0,0,0)')
  gb.addColorStop(0.45, 'rgba(0,0,0,0.62)')
  gb.addColorStop(1, 'rgba(0,0,0,0.88)')
  ctx.fillStyle = gb
  ctx.fillRect(0, fadeTop, g.W, g.H - fadeTop)

  logo(ctx, brand, g.x, g.logoY, g.logo)
  tagRow(ctx, cat, breaking, g.x, top, g.tagH, g.x + g.textW)

  ctx.save()
  ctx.font = `${L.headSize}px ${FONT_XB}`
  ctx.fillStyle = WHITE
  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 16
  const hy = top + g.tagH + TAG_GAP
  L.head.forEach((l, i) => ctx.fillText(l, g.x, hy + i * L.headLh))
  if (L.sum.length) {
    ctx.font = `${L.sumSize}px ${FONT_MD}`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    const sy = hy + L.head.length * L.headLh + SUM_GAP
    L.sum.forEach((l, i) => ctx.fillText(l, g.x, sy + i * L.sumLh))
  }
  ctx.restore()
  return canvas.encode('jpeg', 90)
}
