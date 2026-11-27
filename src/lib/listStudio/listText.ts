import 'server-only'

/**
 * LİSTE STÜDYOSU — katmanları tam kare saydam PNG olarak çizer:
 * sıra kartı (4 görünüm: neon · sinema · kalın · yumuşak), giriş kartı, yayıncı kapanış kartı,
 * köşe sıra rozeti. Alt bant / sinema bantları / logo Reklam Stüdyosu çizimini kullanır.
 * Bu dosyada NaHaber logosu / yazısı YOKTUR ve olmamalıdır.
 */
import { promises as fs } from 'node:fs'
import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import { FONT_MD, FONT_XB, roundRectPath } from '@/lib/reels/reelTheme'
import { wrapLines } from '@/lib/reels/timeline'
import { AD_FONT_BEBAS, AD_FONT_GROTESK, AD_FONT_SERIF, drawAdOverlay, ensureAdFonts } from '@/lib/adStudio/adText'
import type { ListOverlay, RankLook } from './listModel'

const upper = (s: string) => s.toLocaleUpperCase('tr-TR')
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

async function imageFrom(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Görsel indirilemedi (HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > 10 * 1024 * 1024) throw new Error('Görsel 10 MB sınırını aşıyor')
  return loadImage(buf)
}

/** sıra numarası her görünümde Bebas: serif rakamlar (eski stil) satır altına sarkıp başlığa biner */
function numberFont(_look: RankLook): string {
  return AD_FONT_BEBAS
}

/** büyük sayı / başlık parlaması */
function glow(ctx: SKRSContext2D, color: string, blur: number): void {
  ctx.shadowColor = color
  ctx.shadowBlur = blur
}
function noGlow(ctx: SKRSContext2D): void {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
}

function fitFont(ctx: SKRSContext2D, text: string, family: string, start: number, maxW: number, min: number): number {
  let s = start
  ctx.font = `${s}px ${family}`
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 4
    ctx.font = `${s}px ${family}`
  }
  return s
}

function changeBadge(ctx: SKRSContext2D, o: Extract<ListOverlay, { type: 'rank' }>, cx: number, y: number, k: number): number {
  let label = ''
  let bg = 'rgba(255,255,255,0.16)'
  let fg = '#ffffff'
  if (o.change === 'new') {
    label = 'YENİ'
    bg = '#facc15'
    fg = '#111111'
  } else if (o.change === 'up') {
    label = o.prevRank ? `▲ ${o.prevRank} → ${o.rank}` : '▲ YÜKSELDİ'
    bg = '#16a34a'
  } else if (o.change === 'down') {
    label = o.prevRank ? `▼ ${o.prevRank} → ${o.rank}` : '▼ DÜŞTÜ'
    bg = '#dc2626'
  } else if (o.change === 'same') label = '= AYNI SIRA'
  const parts = [label, o.weeks ? `${o.weeks}. HAFTA` : ''].filter(Boolean)
  if (!parts.length) return 0
  const sz = Math.round(40 * k)
  ctx.font = `${sz}px ${FONT_XB}`
  const padX = 26 * k
  const h = sz * 1.6
  const widths = parts.map((p) => ctx.measureText(p).width + padX * 2)
  const gap = 18 * k
  const total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1)
  let x = cx - total / 2
  ctx.textBaseline = 'middle'
  parts.forEach((p, i) => {
    const w = widths[i]!
    ctx.fillStyle = i === 0 && label ? bg : 'rgba(255,255,255,0.16)'
    roundRectPath(ctx, x, y, w, h, h / 2)
    ctx.fill()
    ctx.fillStyle = i === 0 && label ? fg : '#ffffff'
    ctx.fillText(p, x + padX, y + h / 2 + 1)
    x += w + gap
  })
  ctx.textBaseline = 'alphabetic'
  return h
}

function drawRank(ctx: SKRSContext2D, W: number, H: number, o: Extract<ListOverlay, { type: 'rank' }>): void {
  const k = Math.min(W, H) / 1080
  const vertical = H > W * 1.2
  // koyulaştırma: arka plandaki klip/kapak seçilir kalır
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.35)')
  g.addColorStop(1, 'rgba(0,0,0,0.78)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  if (o.look === 'neon' || o.look === 'bold') {
    const rg = ctx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, Math.max(W, H) * 0.6)
    rg.addColorStop(0, hexA(o.accent, 0.32))
    rg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = rg
    ctx.fillRect(0, 0, W, H)
  }
  if (o.look === 'tech') techGrid(ctx, W, H, o.accent, k)
  if (o.look === 'cinema') {
    const bar = Math.round(H * (vertical ? 0.08 : 0.11))
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, W, bar)
    ctx.fillRect(0, H - bar, W, bar)
  }
  const cx = W / 2
  if (o.mode === 'urun') return drawFeature(ctx, W, H, o, k, vertical)
  // sıra numarası
  const num = String(o.rank)
  const fam = numberFont(o.look)
  const numSize = Math.round((vertical ? 560 : 430) * k * (num.length > 1 ? 0.86 : 1))
  ctx.font = `${numSize}px ${fam}`
  ctx.textBaseline = 'alphabetic'
  const nw = ctx.measureText(num).width
  const numBase = H * (vertical ? 0.47 : 0.52)
  if (o.look === 'neon') {
    glow(ctx, o.accent, 60 * k)
    ctx.lineWidth = Math.max(4, 10 * k)
    ctx.strokeStyle = o.accent
    ctx.strokeText(num, cx - nw / 2, numBase)
    glow(ctx, o.accent, 24 * k)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(num, cx - nw / 2, numBase)
  } else if (o.look === 'cinema') {
    glow(ctx, 'rgba(0,0,0,0.6)', 30 * k)
    ctx.fillStyle = o.accent
    ctx.fillText(num, cx - nw / 2, numBase)
  } else if (o.look === 'bold') {
    ctx.fillStyle = o.accent
    ctx.fillText(num, cx - nw / 2 + 14 * k, numBase + 14 * k)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(num, cx - nw / 2, numBase)
  } else if (o.look === 'tech') {
    glow(ctx, o.accent, 40 * k)
    ctx.lineWidth = Math.max(3, 6 * k)
    ctx.strokeStyle = o.accent
    ctx.strokeText(num, cx - nw / 2, numBase)
    noGlow(ctx)
    ctx.fillStyle = hexA(o.accent, 0.18)
    ctx.fillText(num, cx - nw / 2, numBase)
  } else if (o.look === 'minimal') {
    ctx.fillStyle = '#ffffff'
    ctx.fillText(num, cx - nw / 2, numBase)
  } else {
    glow(ctx, 'rgba(0,0,0,0.5)', 24 * k)
    ctx.fillStyle = '#F6EBD2'
    ctx.fillText(num, cx - nw / 2, numBase)
  }
  noGlow(ctx)
  // «# / N» küçük etiket
  ctx.font = `${Math.round(34 * k)}px ${AD_FONT_GROTESK}`
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  const of = o.rank === 1 ? 'ZİRVE' : `TOP ${o.total}`
  const ow = ctx.measureText(of).width
  ctx.fillText(of, cx - ow / 2, numBase - numSize * 0.78)
  // ad + alt bilgi
  let y = numBase + 50 * k
  const titleFam = o.look === 'soft' || o.look === 'cinema' ? AD_FONT_SERIF : o.look === 'minimal' || o.look === 'tech' ? AD_FONT_GROTESK : AD_FONT_BEBAS
  // teknoloji: marka adları olduğu gibi (tr büyük harf «iPhone»u «İPHONE» yapar)
  const title = o.look === 'neon' || o.look === 'bold' ? upper(o.title) : o.title
  const tSize = Math.round((vertical ? 112 : 96) * k)
  ctx.font = `${tSize}px ${titleFam}`
  const lines = wrapLines((s) => ctx.measureText(s).width, title, W * 0.86, 2)
  ctx.textBaseline = 'top'
  for (const l of lines) {
    ctx.font = `${tSize}px ${titleFam}`
    glow(ctx, 'rgba(0,0,0,0.6)', 18 * k)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(l, cx - ctx.measureText(l).width / 2, y)
    y += tSize * 1.05
  }
  noGlow(ctx)
  if (o.subtitle) {
    const sz = fitFont(ctx, o.subtitle, FONT_MD, Math.round(52 * k), W * 0.86, Math.round(30 * k))
    ctx.font = `${sz}px ${FONT_MD}`
    ctx.fillStyle = o.look === 'neon' ? o.accent : 'rgba(255,255,255,0.88)'
    ctx.fillText(o.subtitle, cx - ctx.measureText(o.subtitle).width / 2, y + 10 * k)
    y += sz * 1.5 + 10 * k
  }
  if (o.price) {
    const sz = Math.round(58 * k)
    ctx.font = `${sz}px ${AD_FONT_BEBAS}`
    ctx.fillStyle = o.accent
    ctx.fillText(o.price, cx - ctx.measureText(o.price).width / 2, y + 6 * k)
    y += sz * 1.15
  }
  // alt çizgi
  ctx.fillStyle = o.accent
  const lw = Math.round(160 * k)
  ctx.fillRect(cx - lw / 2, y + 16 * k, lw, Math.max(4, Math.round(7 * k)))
  y += 50 * k
  changeBadge(ctx, o, cx, y, k)
}

/** TEKNOLOJİ: ince ızgara + köşe parantezleri (fütüristik HUD) */
function techGrid(ctx: SKRSContext2D, W: number, H: number, accent: string, k: number): void {
  ctx.strokeStyle = hexA(accent, 0.12)
  ctx.lineWidth = Math.max(1, Math.round(1.5 * k))
  const step = Math.round(90 * k)
  for (let x = step; x < W; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = step; y < H; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  ctx.strokeStyle = hexA(accent, 0.85)
  ctx.lineWidth = Math.max(3, Math.round(5 * k))
  const m = 60 * k
  const L = 90 * k
  const top = H > W * 1.2 ? H * 0.1 : m
  const corners: Array<[number, number, number, number]> = [
    [m, top, 1, 1],
    [W - m, top, -1, 1],
    [m, H - top, 1, -1],
    [W - m, H - top, -1, -1],
  ]
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath()
    ctx.moveTo(x + dx * L, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + dy * L)
    ctx.stroke()
  }
}

/** TEKNOLOJİ ürün / haber modu: «01 / 05» + büyük özellik adı + açıklama */
function drawFeature(ctx: SKRSContext2D, W: number, H: number, o: Extract<ListOverlay, { type: 'rank' }>, k: number, vertical: boolean): void {
  const cx = W / 2
  const tag = `${String(o.rank).padStart(2, '0')} / ${String(o.total).padStart(2, '0')}`
  const tagSize = Math.round(46 * k)
  const titleFam = o.look === 'minimal' ? AD_FONT_GROTESK : o.look === 'cinema' ? AD_FONT_SERIF : AD_FONT_BEBAS
  const title = o.look === 'neon' || o.look === 'bold' ? upper(o.title) : o.title
  const tSize = Math.round((vertical ? 128 : 104) * k)
  ctx.font = `${tSize}px ${titleFam}`
  const lines = wrapLines((s) => ctx.measureText(s).width, title, W * 0.84, 3)
  const sSize = Math.round(46 * k)
  ctx.font = `${sSize}px ${FONT_MD}`
  const sub = o.subtitle ? wrapLines((s) => ctx.measureText(s).width, o.subtitle, W * 0.8, 4) : []
  const total = tagSize * 2 + lines.length * tSize * 1.05 + (sub.length ? 30 * k + sub.length * sSize * 1.35 : 0)
  let y = (H - total) / 2
  ctx.textBaseline = 'top'
  ctx.font = `${tagSize}px ${AD_FONT_GROTESK}`
  ctx.fillStyle = o.accent
  if (o.look === 'tech') glow(ctx, o.accent, 18 * k)
  ctx.fillText(tag, cx - ctx.measureText(tag).width / 2, y)
  noGlow(ctx)
  y += tagSize * 2
  for (const l of lines) {
    ctx.font = `${tSize}px ${titleFam}`
    glow(ctx, 'rgba(0,0,0,0.6)', 18 * k)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(l, cx - ctx.measureText(l).width / 2, y)
    y += tSize * 1.05
  }
  noGlow(ctx)
  if (sub.length) {
    y += 30 * k
    ctx.font = `${sSize}px ${FONT_MD}`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (const l of sub) {
      ctx.fillText(l, cx - ctx.measureText(l).width / 2, y)
      y += sSize * 1.35
    }
  }
  ctx.fillStyle = o.accent
  const lw = Math.round(140 * k)
  ctx.fillRect(cx - lw / 2, y + 24 * k, lw, Math.max(4, Math.round(6 * k)))
  ctx.textBaseline = 'alphabetic'
}

/** TEKNOLOJİ: özellik paneli (ekran, işlemci, kamera, batarya…) + fiyat — klibin üstünde, cam panel */
function drawSpecs(ctx: SKRSContext2D, W: number, H: number, o: Extract<ListOverlay, { type: 'specs' }>): void {
  const k = Math.min(W, H) / 1080
  const rows = o.specs.slice(0, 6)
  const lab = Math.round(30 * k)
  const val = Math.round(42 * k)
  const rowH = lab + val + 26 * k
  const pad = 34 * k
  const priceH = o.price ? Math.round(70 * k) + 20 * k : 0
  const w = o.vertical ? W * 0.84 : W * 0.38
  const h = pad * 2 + rows.length * rowH + priceH
  const x = o.vertical ? (W - w) / 2 : W - w - 70 * k
  const y = o.vertical ? H * 0.9 - h : (H - h) / 2
  ctx.fillStyle = o.look === 'minimal' ? 'rgba(255,255,255,0.12)' : 'rgba(6,10,18,0.72)'
  roundRectPath(ctx, x, y, w, h, 28 * k)
  ctx.fill()
  ctx.strokeStyle = hexA(o.accent, o.look === 'minimal' ? 0.5 : 0.85)
  ctx.lineWidth = Math.max(2, Math.round(3 * k))
  roundRectPath(ctx, x, y, w, h, 28 * k)
  ctx.stroke()
  ctx.textBaseline = 'top'
  let cy = y + pad
  for (const r of rows) {
    ctx.font = `${lab}px ${FONT_XB}`
    ctx.fillStyle = o.accent
    ctx.fillText(upper(r.label), x + pad, cy)
    ctx.font = `${val}px ${FONT_XB}`
    ctx.fillStyle = '#ffffff'
    const t = wrapLines((s) => ctx.measureText(s).width, r.value, w - pad * 2, 1)[0] ?? r.value
    ctx.fillText(t, x + pad, cy + lab + 6 * k)
    cy += rowH
  }
  if (o.price) {
    const ps = Math.round(70 * k)
    ctx.font = `${ps}px ${AD_FONT_BEBAS}`
    ctx.fillStyle = o.accent
    ctx.fillText(o.price, x + pad, cy + 10 * k)
  }
  ctx.textBaseline = 'alphabetic'
}

async function drawIntro(ctx: SKRSContext2D, W: number, H: number, o: Extract<ListOverlay, { type: 'intro' }>): Promise<void> {
  const k = Math.min(W, H) / 1080
  const vertical = H > W * 1.2
  ctx.fillStyle = 'rgba(6,6,12,0.66)'
  ctx.fillRect(0, 0, W, H)
  const rg = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.7)
  rg.addColorStop(0, hexA(o.accent, 0.38))
  rg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, H)
  const cx = W / 2
  const blocks: Array<{ h: number; draw: (y: number) => void | Promise<void> }> = []
  if (o.logoUrl) {
    try {
      const img = await imageFrom(o.logoUrl)
      const box = Math.min(W, H) * 0.3
      const s = Math.min(box / img.width, (box * 0.5) / img.height)
      const w = img.width * s
      const h = img.height * s
      blocks.push({ h: h + 50 * k, draw: (y) => ctx.drawImage(img, cx - w / 2, y, w, h) })
    } catch {
      /* logo okunamazsa kart yine çizilir */
    }
  }
  if (o.look === 'tech') techGrid(ctx, W, H, o.accent, k)
  const top = o.kicker ?? `TOP ${o.n}`
  const topSize = Math.round((vertical ? 300 : 240) * k * (top.length > 6 ? 0.72 : 1))
  blocks.push({
    h: topSize * 0.95,
    draw: (y) => {
      ctx.font = `${topSize}px ${AD_FONT_BEBAS}`
      ctx.textBaseline = 'top'
      const w = ctx.measureText(top).width
      if (o.look === 'neon') {
        glow(ctx, o.accent, 50 * k)
        ctx.lineWidth = Math.max(4, 8 * k)
        ctx.strokeStyle = o.accent
        ctx.strokeText(top, cx - w / 2, y)
      }
      glow(ctx, hexA(o.accent, 0.8), 26 * k)
      ctx.fillStyle = o.look === 'cinema' || o.look === 'tech' ? o.accent : '#ffffff'
      ctx.fillText(top, cx - w / 2, y)
      noGlow(ctx)
    },
  })
  const tSize = Math.round(76 * k)
  ctx.font = `${tSize}px ${FONT_XB}`
  const tl = wrapLines((s) => ctx.measureText(s).width, o.look === 'tech' || o.look === 'minimal' ? o.title : upper(o.title), W * 0.84, 3)
  blocks.push({
    h: tl.length * tSize * 1.15 + 30 * k,
    draw: (y) => {
      ctx.font = `${tSize}px ${FONT_XB}`
      ctx.fillStyle = '#ffffff'
      tl.forEach((l, i) => ctx.fillText(l, cx - ctx.measureText(l).width / 2, y + 20 * k + i * tSize * 1.15))
    },
  })
  if (o.subtitle) {
    const sz = Math.round(46 * k)
    blocks.push({
      h: sz * 1.8,
      draw: (y) => {
        ctx.font = `${sz}px ${FONT_MD}`
        ctx.fillStyle = o.accent
        const w = ctx.measureText(o.subtitle).width
        ctx.fillText(o.subtitle, cx - w / 2, y + 18 * k)
      },
    })
  }
  if (o.handle) {
    const sz = Math.round(40 * k)
    blocks.push({
      h: sz * 2.2,
      draw: (y) => {
        const t = `@${o.handle}`
        ctx.font = `${sz}px ${AD_FONT_GROTESK}`
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.fillText(t, cx - ctx.measureText(t).width / 2, y + 30 * k)
      },
    })
  }
  const total = blocks.reduce((a, b) => a + b.h, 0)
  let y = (H - total) / 2
  for (const b of blocks) {
    await b.draw(y)
    y += b.h
  }
}

function drawOutro(ctx: SKRSContext2D, W: number, H: number, o: Extract<ListOverlay, { type: 'outro' }>): void {
  const k = Math.min(W, H) / 1080
  ctx.fillStyle = '#0a0a10'
  ctx.fillRect(0, 0, W, H)
  const g = ctx.createLinearGradient(0, 0, W * 0.5, H)
  g.addColorStop(0, '#0a0a10')
  g.addColorStop(0.6, '#15151f')
  g.addColorStop(1, hexA(o.accent, 0.55))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const cx = W / 2
  ctx.textBaseline = 'top'
  const name = upper(o.name || o.handle)
  const nSize = fitFont(ctx, name, AD_FONT_BEBAS, Math.round(150 * k), W * 0.86, Math.round(70 * k))
  ctx.font = `${nSize}px ${AD_FONT_BEBAS}`
  const nl = wrapLines((s) => ctx.measureText(s).width, name, W * 0.86, 2)
  const handle = o.handle ? `@${o.handle}` : ''
  const hSize = Math.round(54 * k)
  const sSize = Math.round(44 * k)
  const total = nl.length * nSize + (handle ? hSize * 1.8 : 0) + (o.slogan ? sSize * 2.4 : 0) + 60 * k
  let y = (H - total) / 2
  for (const l of nl) {
    ctx.font = `${nSize}px ${AD_FONT_BEBAS}`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(l, cx - ctx.measureText(l).width / 2, y)
    y += nSize
  }
  ctx.fillStyle = o.accent
  const lw = Math.round(150 * k)
  ctx.fillRect(cx - lw / 2, y + 10 * k, lw, Math.max(4, Math.round(7 * k)))
  y += 50 * k
  if (handle) {
    ctx.font = `${hSize}px ${AD_FONT_GROTESK}`
    ctx.fillStyle = o.accent
    ctx.fillText(handle, cx - ctx.measureText(handle).width / 2, y)
    y += hSize * 1.8
  }
  if (o.slogan) {
    ctx.font = `${sSize}px ${FONT_MD}`
    const sl = wrapLines((s) => ctx.measureText(s).width, o.slogan, W * 0.84, 2)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    sl.forEach((l, i) => ctx.fillText(l, cx - ctx.measureText(l).width / 2, y + 20 * k + i * sSize * 1.3))
  }
}

async function drawBadge(ctx: SKRSContext2D, W: number, H: number, o: Extract<ListOverlay, { type: 'badge' }>): Promise<void> {
  const k = Math.min(W, H) / 1080
  const vertical = H > W * 1.2
  const r = 62 * k
  const m = 46 * k
  const x = m + r
  const y = (vertical ? H * 0.085 : m) + r
  glow(ctx, 'rgba(0,0,0,0.45)', 14 * k)
  ctx.fillStyle = o.accent
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  const t = String(o.rank)
  const sz = fitFont(ctx, t, AD_FONT_BEBAS, Math.round(100 * k), r * 1.5, Math.round(40 * k))
  ctx.font = `${sz}px ${AD_FONT_BEBAS}`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(t, x - ctx.measureText(t).width / 2, y + 4 * k)
  ctx.textBaseline = 'alphabetic'
  if (o.logoUrl) {
    try {
      const img = await imageFrom(o.logoUrl)
      const box = r * 1.7
      const s = Math.min(box / img.width, (box * 0.6) / img.height)
      const w = img.width * s
      const h = img.height * s
      ctx.drawImage(img, x + r + 18 * k, y - h / 2, w, h)
    } catch {
      /* rozet logosuz da çizilir */
    }
  }
}

/** Bir liste katmanını W×H saydam PNG olarak yazar. */
export async function drawListOverlay(o: ListOverlay, W: number, H: number, file: string, root = process.cwd()): Promise<void> {
  if (o.type === 'ad') return drawAdOverlay(o.o, W, H, file, root)
  ensureAdFonts(root)
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  if (o.type === 'rank') drawRank(ctx, W, H, o)
  else if (o.type === 'specs') drawSpecs(ctx, W, H, o)
  else if (o.type === 'intro') await drawIntro(ctx, W, H, o)
  else if (o.type === 'outro') drawOutro(ctx, W, H, o)
  else await drawBadge(ctx, W, H, o)
  await fs.writeFile(file, await canvas.encode('png'))
}
