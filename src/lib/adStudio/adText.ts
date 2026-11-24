import 'server-only'

/**
 * REKLAM STÜDYOSU — reklam katmanlarını tam kare saydam PNG olarak çizer
 * (8 yazı stili, sinema bantları, çerçeve, şerit, firma logosu, firma kapanış kartı).
 * Bu dosyada NaHaber logosu / yazısı YOKTUR ve olmamalıdır.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import { FONT_MD, FONT_XB, ensureFonts, roundRectPath } from '@/lib/reels/reelTheme'
import { wrapLines } from '@/lib/reels/timeline'
import type { AdCard, AdOverlay, AdTextStyle, LogoPos, TextPos } from './adModel'

export const AD_FONT_BEBAS = 'AdBebasNeue'
export const AD_FONT_SERIF = 'AdPlayfairItalic'
export const AD_FONT_GROTESK = 'AdSpaceGrotesk'
let adFontsReady = false

export function ensureAdFonts(root = process.cwd()): void {
  ensureFonts(root)
  if (adFontsReady) return
  const dir = path.join(root, 'src/lib/adStudio/fonts')
  GlobalFonts.registerFromPath(path.join(dir, 'BebasNeue-Regular.ttf'), AD_FONT_BEBAS)
  GlobalFonts.registerFromPath(path.join(dir, 'PlayfairDisplay-Italic.ttf'), AD_FONT_SERIF)
  GlobalFonts.registerFromPath(path.join(dir, 'SpaceGrotesk.ttf'), AD_FONT_GROTESK)
  adFontsReady = true
}

const upper = (s: string) => s.toLocaleUpperCase('tr-TR')

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** metin bloğunun dikey merkezi (bantlar / alt bölge payı) */
function centerY(pos: TextPos, H: number, W: number): number {
  const vertical = H > W * 1.2
  if (pos === 'ust') return H * (vertical ? 0.2 : 0.22)
  if (pos === 'orta') return H * 0.5
  return H * (vertical ? 0.76 : 0.78)
}

/** letter-spaced tek satır genişliği / çizimi (canvas letterSpacing her sürümde yok) */
function spacedWidth(ctx: SKRSContext2D, s: string, sp: number): number {
  return [...s].reduce((w, ch) => w + ctx.measureText(ch).width + sp, 0) - sp
}
function fillSpaced(ctx: SKRSContext2D, s: string, x: number, y: number, sp: number): void {
  let cx = x
  for (const ch of s) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + sp
  }
}

function drawText(ctx: SKRSContext2D, W: number, H: number, o: Extract<AdOverlay, { type: 'text' }>): void {
  const k = Math.min(W, H) / 1080
  const base = Math.round(o.size * k)
  const cy = centerY(o.pos, H, W)
  const style: AdTextStyle = o.style
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'

  if (style === 'guclu') {
    const size = Math.round(base * 1.55)
    ctx.font = `${size}px ${AD_FONT_BEBAS}`
    const text = upper(o.text)
    const x0 = W * 0.09
    const lines = wrapLines((s) => ctx.measureText(s).width, text, W * 0.8, 4)
    const lh = Math.round(size * 1.0)
    const top = cy - (lines.length * lh) / 2
    ctx.fillStyle = o.accent
    ctx.fillRect(x0 - Math.round(26 * k), top + lh * 0.08, Math.max(6, Math.round(12 * k)), lines.length * lh - lh * 0.12)
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = Math.round(18 * k)
    ctx.shadowOffsetY = Math.round(4 * k)
    ctx.fillStyle = '#FFFFFF'
    lines.forEach((l, i) => ctx.fillText(l, x0, top + i * lh))
    return
  }

  if (style === 'sinema') {
    const size = Math.round(base * 0.82)
    ctx.font = `bold ${size}px ${AD_FONT_GROTESK}`
    const sp = Math.round(size * 0.12)
    const text = upper(o.text)
    const lines = wrapLines((s) => spacedWidth(ctx, s, sp), text, W * 0.84, 4)
    const lh = Math.round(size * 1.35)
    const blockH = lines.length * lh
    const top = cy - blockH / 2
    const g = ctx.createLinearGradient(0, top - lh * 1.4, 0, top + blockH + lh * 1.4)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.3, 'rgba(0,0,0,0.62)')
    g.addColorStop(0.7, 'rgba(0,0,0,0.62)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, top - lh * 1.4, W, blockH + lh * 2.8)
    ctx.fillStyle = '#FFFFFF'
    lines.forEach((l, i) => fillSpaced(ctx, l, (W - spacedWidth(ctx, l, sp)) / 2, top + i * lh, sp))
    ctx.fillStyle = o.accent
    const lw = Math.round(90 * k)
    ctx.fillRect((W - lw) / 2, top + blockH + Math.round(14 * k), lw, Math.max(3, Math.round(5 * k)))
    return
  }

  if (style === 'zarif') {
    const size = Math.round(base * 1.05)
    ctx.font = `${size}px ${AD_FONT_SERIF}`
    const lines = wrapLines((s) => ctx.measureText(s).width, o.text, W * 0.74, 4)
    const lh = Math.round(size * 1.3)
    const widths = lines.map((l) => ctx.measureText(l).width)
    const bw = Math.max(...widths)
    const pad = Math.round(size * 0.7)
    const blockH = lines.length * lh
    const top = cy - blockH / 2
    ctx.fillStyle = 'rgba(12,10,8,0.66)'
    roundRectPath(ctx, (W - bw) / 2 - pad, top - pad * 0.8, bw + pad * 2, blockH + pad * 1.9, Math.round(14 * k))
    ctx.fill()
    ctx.fillStyle = '#F8F3E8'
    lines.forEach((l, i) => ctx.fillText(l, (W - widths[i]!) / 2, top + i * lh))
    ctx.fillStyle = o.accent
    const lw = Math.round(120 * k)
    ctx.fillRect((W - lw) / 2, top + blockH + pad * 0.35, lw, Math.max(2, Math.round(3 * k)))
    return
  }

  if (style === 'kurumsal') {
    const size = Math.round(base * 0.92)
    ctx.font = `${size}px ${FONT_XB}`
    const lines = wrapLines((s) => ctx.measureText(s).width, o.text, W * 0.76, 4)
    const lh = Math.round(size * 1.25)
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const pad = Math.round(size * 0.6)
    const blockH = lines.length * lh
    const top = cy - blockH / 2
    const x0 = (W - bw) / 2 - pad
    ctx.fillStyle = 'rgba(15,30,61,0.92)'
    roundRectPath(ctx, x0, top - pad, bw + pad * 2, blockH + pad * 2, Math.round(10 * k))
    ctx.fill()
    ctx.fillStyle = o.accent
    ctx.fillRect(x0, top - pad, bw + pad * 2, Math.max(4, Math.round(7 * k)))
    ctx.fillStyle = '#FFFFFF'
    lines.forEach((l, i) => ctx.fillText(l, x0 + pad, top + i * lh))
    return
  }

  if (style === 'etiket') {
    const size = Math.round(base * 0.95)
    ctx.font = `${size}px ${FONT_XB}`
    const text = upper(o.text)
    const lines = wrapLines((s) => ctx.measureText(s).width, text, W * 0.7, 3)
    const lh = Math.round(size * 1.18)
    const widths = lines.map((l) => ctx.measureText(l).width)
    const bw = Math.max(...widths)
    const pad = Math.round(size * 0.45)
    const blockH = lines.length * lh
    ctx.save()
    ctx.translate(W / 2, cy)
    ctx.rotate((-3.5 * Math.PI) / 180)
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = Math.round(16 * k)
    ctx.fillStyle = o.accent === '#ff5a1f' ? '#FACC15' : o.accent
    roundRectPath(ctx, -bw / 2 - pad, -blockH / 2 - pad * 0.7, bw + pad * 2, blockH + pad * 1.4, Math.round(12 * k))
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#111111'
    lines.forEach((l, i) => ctx.fillText(l, -widths[i]! / 2, -blockH / 2 + i * lh))
    ctx.restore()
    return
  }

  if (style === 'altyazi') {
    const size = Math.round(base * 0.86)
    ctx.font = `${size}px ${FONT_MD}`
    const lines = wrapLines((s) => ctx.measureText(s).width, o.text, W * 0.82, 4)
    const lh = Math.round(size * 1.45)
    const top = cy - (lines.length * lh) / 2
    const pad = Math.round(size * 0.4)
    lines.forEach((l, i) => {
      const w = ctx.measureText(l).width
      ctx.fillStyle = 'rgba(0,0,0,0.68)'
      roundRectPath(ctx, (W - w) / 2 - pad, top + i * lh - pad * 0.3, w + pad * 2, lh - pad * 0.1, Math.round(8 * k))
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(l, (W - w) / 2, top + i * lh + (lh - size * 1.2) / 2 - pad * 0.15)
    })
    return
  }

  if (style === 'vurgu') {
    const size = Math.round(base * 1.0)
    ctx.font = `${size}px ${FONT_XB}`
    const words = o.text.split(/\s+/).filter(Boolean)
    const target = (o.emphasis || words[words.length - 1] || '').toLocaleLowerCase('tr-TR').replace(/[.,!?…]/g, '')
    const lines = wrapLines((s) => ctx.measureText(s).width, o.text, W * 0.82, 4)
    const lh = Math.round(size * 1.3)
    const top = cy - (lines.length * lh) / 2
    const space = ctx.measureText(' ').width
    const pad = Math.round(size * 0.14)
    lines.forEach((l, i) => {
      const ws = l.split(' ')
      let x = (W - ctx.measureText(l).width) / 2
      const y = top + i * lh
      for (const w of ws) {
        const ww = ctx.measureText(w).width
        const hit = target && w.toLocaleLowerCase('tr-TR').replace(/[.,!?…]/g, '') === target
        if (hit) {
          ctx.shadowColor = 'transparent'
          ctx.fillStyle = o.accent
          roundRectPath(ctx, x - pad, y - pad * 0.4, ww + pad * 2, size * 1.2 + pad * 0.6, Math.round(8 * k))
          ctx.fill()
          ctx.fillStyle = '#FFFFFF'
          ctx.fillText(w, x, y)
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.85)'
          ctx.shadowBlur = Math.round(14 * k)
          ctx.shadowOffsetY = Math.round(3 * k)
          ctx.fillStyle = '#FFFFFF'
          ctx.fillText(w, x, y)
          ctx.shadowColor = 'transparent'
        }
        x += ww + space
      }
    })
    return
  }

  // bant (varsayılan): renkli bant üzerinde beyaz kalın yazı
  const size = Math.round(base * 1.0)
  ctx.font = `${size}px ${FONT_XB}`
  const lines = wrapLines((s) => ctx.measureText(s).width, o.text, W * 0.8, 4)
  const lh = Math.round(size * 1.22)
  const widths = lines.map((l) => ctx.measureText(l).width)
  const pad = Math.round(size * 0.38)
  const top = cy - (lines.length * lh) / 2
  lines.forEach((l, i) => {
    const w = widths[i]!
    const x = (W - w) / 2
    ctx.fillStyle = o.accent
    ctx.fillRect(x - pad, top + i * lh - pad * 0.3, w + pad * 2, lh + (i === lines.length - 1 ? pad * 0.3 : 0))
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(l, x, top + i * lh + (lh - size * 1.16) / 2)
  })
}

function drawDeco(ctx: SKRSContext2D, W: number, H: number, o: Extract<AdOverlay, { type: 'deco' }>): void {
  const k = Math.min(W, H) / 1080
  const d = o.deco
  if (d.kind === 'bars') {
    const bh = Math.round(H * (H > W ? 0.065 : 0.1))
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, bh)
    ctx.fillRect(0, H - bh, W, bh)
  } else if (d.kind === 'frame') {
    const m = Math.round(Math.min(W, H) * 0.035)
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.lineWidth = Math.max(2, Math.round(4 * k))
    ctx.strokeRect(m, m, W - m * 2, H - m * 2)
  } else if (d.kind === 'ribbon') {
    const size = Math.round(54 * k)
    ctx.font = `${size}px ${FONT_XB}`
    ctx.textBaseline = 'top'
    const sp = Math.round(size * 0.08)
    const tw = spacedWidth(ctx, d.text, sp)
    const padX = Math.round(size * 0.6)
    const padY = Math.round(size * 0.32)
    const x = Math.round(W * 0.06)
    const y = Math.round(H * (H > W ? 0.085 : 0.12))
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = Math.round(12 * k)
    ctx.fillStyle = d.bg
    roundRectPath(ctx, x, y, tw + padX * 2, size * 1.2 + padY * 2, Math.round(8 * k))
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = d.fg
    fillSpaced(ctx, d.text, x + padX, y + padY, sp)
  }
}

async function imageFrom(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Logo indirilemedi (HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > 10 * 1024 * 1024) throw new Error('Logo 10 MB sınırını aşıyor')
  return loadImage(buf)
}

async function drawLogo(ctx: SKRSContext2D, W: number, H: number, url: string, pos: LogoPos): Promise<void> {
  const img = await imageFrom(url)
  const box = Math.min(W, H) * 0.2
  const s = Math.min(box / img.width, (box * 0.6) / img.height)
  const w = img.width * s
  const h = img.height * s
  const m = Math.min(W, H) * 0.05
  const top = H > W ? H * 0.085 : m
  const x = pos.startsWith('sag') ? W - m - w : m
  const y = pos.endsWith('ust') ? top : H - top - h
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = Math.round(10 * (Math.min(W, H) / 1080))
  ctx.drawImage(img, x, y, w, h)
  ctx.shadowColor = 'transparent'
}

async function drawCard(ctx: SKRSContext2D, W: number, H: number, card: AdCard, accent: string, logoUrl: string | null): Promise<void> {
  const k = Math.min(W, H) / 1080
  // kart tamamen opak: alttaki video görünmez
  ctx.fillStyle = '#0b0b10'
  ctx.fillRect(0, 0, W, H)
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H)
  g.addColorStop(0, '#0b0b10')
  g.addColorStop(0.65, '#14141c')
  g.addColorStop(1, hexA(accent, 0.55))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = hexA(accent, 0.9)
  ctx.fillRect(0, H - Math.max(6, Math.round(10 * k)), W, Math.max(6, Math.round(10 * k)))
  ctx.textBaseline = 'top'
  const blocks: Array<{ h: number; draw: (y: number) => void }> = []
  if (logoUrl) {
    try {
      const img = await imageFrom(logoUrl)
      const box = Math.min(W, H) * 0.34
      const s = Math.min(box / img.width, (box * 0.62) / img.height)
      const w = img.width * s
      const h = img.height * s
      blocks.push({ h: h + 40 * k, draw: (y) => ctx.drawImage(img, (W - w) / 2, y, w, h) })
    } catch {
      /* logo okunamazsa kart yine çizilir */
    }
  }
  const nameSize = Math.round(128 * k)
  ctx.font = `${nameSize}px ${AD_FONT_BEBAS}`
  const nameLines = wrapLines((s) => ctx.measureText(s).width, upper(card.name || ''), W * 0.84, 3)
  if (nameLines.length)
    blocks.push({
      h: nameLines.length * nameSize * 1.0 + 30 * k,
      draw: (y) => {
        ctx.font = `${nameSize}px ${AD_FONT_BEBAS}`
        ctx.fillStyle = '#FFFFFF'
        nameLines.forEach((l, i) => ctx.fillText(l, (W - ctx.measureText(l).width) / 2, y + i * nameSize))
        ctx.fillStyle = accent
        const lw = Math.round(140 * k)
        ctx.fillRect((W - lw) / 2, y + nameLines.length * nameSize + 8 * k, lw, Math.max(3, Math.round(6 * k)))
      },
    })
  if (card.slogan) {
    const sz = Math.round(52 * k)
    ctx.font = `${sz}px ${AD_FONT_SERIF}`
    const ls = wrapLines((s) => ctx.measureText(s).width, card.slogan, W * 0.8, 3)
    blocks.push({
      h: ls.length * sz * 1.3 + 36 * k,
      draw: (y) => {
        ctx.font = `${sz}px ${AD_FONT_SERIF}`
        ctx.fillStyle = '#F1ECE2'
        ls.forEach((l, i) => ctx.fillText(l, (W - ctx.measureText(l).width) / 2, y + 16 * k + i * sz * 1.3))
      },
    })
  }
  const info = [card.phone && `Tel: ${card.phone}`, card.address, card.web].filter(Boolean) as string[]
  if (info.length) {
    const sz = Math.round(40 * k)
    blocks.push({
      h: info.length * sz * 1.5 + 20 * k,
      draw: (y) => {
        ctx.font = `${sz}px ${FONT_MD}`
        info.forEach((l, i) => {
          const t = wrapLines((s) => ctx.measureText(s).width, l, W * 0.86, 1)[0] ?? l
          ctx.fillStyle = i === 0 && card.phone ? '#FFFFFF' : 'rgba(255,255,255,0.82)'
          ctx.fillText(t, (W - ctx.measureText(t).width) / 2, y + 20 * k + i * sz * 1.5)
        })
      },
    })
  }
  const total = blocks.reduce((a, b) => a + b.h, 0)
  let y = (H - total) / 2
  for (const b of blocks) {
    b.draw(y)
    y += b.h
  }
}

/** Bir reklam katmanını W×H saydam PNG olarak yazar. */
export async function drawAdOverlay(o: AdOverlay, W: number, H: number, file: string, root = process.cwd()): Promise<void> {
  ensureAdFonts(root)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  if (o.type === 'text') drawText(ctx, W, H, o)
  else if (o.type === 'deco') drawDeco(ctx, W, H, o)
  else if (o.type === 'logo') await drawLogo(ctx, W, H, o.url, o.pos)
  else await drawCard(ctx, W, H, o.card, o.accent, o.logoUrl)
  await fs.writeFile(file, await canvas.encode('png'))
}
