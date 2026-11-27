import 'server-only'

/**
 * ETKİNLİK STÜDYOSU — kart şablonları (tek kare / kaydırmalı JPEG).
 * Etkinlik görseli varsa kullanılır (video ise seçilen aralığın ilk saniyesinden kare alınır).
 * NaHaber adı / logosu yoktur; filigran = seçilen hesabın adı.
 */
import { createCanvas, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { FONT_MD, FONT_XB, roundRectPath } from '@/lib/reels/reelTheme'
import { wrapLines } from '@/lib/reels/timeline'
import { AD_FONT_BEBAS, AD_FONT_GROTESK, AD_FONT_SERIF, ensureAdFonts } from '@/lib/adStudio/adText'
import { TEMPLATE_INFO, cardCount, dayShort, type CardTemplate } from './eventTemplates'
import { evRows, type EvRow, type ListItem, type ListProject } from './listModel'
import { fit, hexA, isLight } from './eventOverlays'

const up = (s: string) => s.toLocaleUpperCase('tr-TR')
type Ctx = SKRSContext2D
type Photo = Image | null

export function cardSize(aspect: ListProject['aspect']): [number, number] {
  return aspect === '9:16' ? [1080, 1920] : aspect === '1:1' ? [1080, 1080] : aspect === '16:9' ? [1920, 1080] : [1080, 1350]
}

async function fetchBuf(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const b = Buffer.from(await res.arrayBuffer())
  if (b.byteLength > 15 * 1024 * 1024) throw new Error('görsel çok büyük')
  return b
}
async function videoFrame(url: string, atMs: number): Promise<Buffer | null> {
  try {
    const { resolveFfmpegPath } = await import('@/lib/reels/reelTheme')
    const bin = await resolveFfmpegPath()
    const { spawn } = await import('node:child_process')
    return await new Promise((resolve) => {
      const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, atMs) / 1000), '-i', url, '-frames:v', '1', '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1'], { stdio: ['ignore', 'pipe', 'ignore'] })
      const chunks: Buffer[] = []
      const t = setTimeout(() => p.kill('SIGKILL'), 30_000)
      p.stdout.on('data', (d: Buffer) => chunks.push(d))
      p.on('close', () => (clearTimeout(t), resolve(chunks.length ? Buffer.concat(chunks) : null)))
      p.on('error', () => (clearTimeout(t), resolve(null)))
    })
  } catch {
    return null
  }
}
/** etkinliğin fotoğrafı: kapak > görsel medya > videodan kare */
export async function itemPhoto(item: ListItem): Promise<Photo> {
  try {
    if (item.coverUrl) return await loadImage(await fetchBuf(item.coverUrl))
    const m = item.media
    if (!m) return null
    if (m.kind === 'image') return await loadImage(await fetchBuf(m.url))
    const f = await videoFrame(m.url, m.inMs + 800)
    return f ? await loadImage(f) : null
  } catch {
    return null
  }
}

function cover(ctx: Ctx, img: Photo, x: number, y: number, w: number, h: number, fallback: string) {
  if (!img) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h)
    g.addColorStop(0, hexA(fallback, 0.55))
    g.addColorStop(1, hexA('#000000', 0.55))
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
    return
  }
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}
function clipRound(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fn: () => void) {
  ctx.save()
  roundRectPath(ctx, x, y, w, h, r)
  ctx.clip()
  fn()
  ctx.restore()
}
function text(ctx: Ctx, t: string, x: number, y: number, size: number, font: string, color: string, maxW?: number, align: 'left' | 'center' | 'right' = 'left'): number {
  ctx.font = `${size}px ${font}`
  ctx.fillStyle = color
  const s = maxW ? (wrapLines((m) => ctx.measureText(m).width, t, maxW, 1)[0] ?? t) : t
  const w = ctx.measureText(s).width
  ctx.fillText(s, align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y)
  return w
}
function lines(ctx: Ctx, t: string, x: number, y: number, size: number, font: string, color: string, maxW: number, max: number, lh = 0.95): number {
  ctx.font = `${size}px ${font}`
  ctx.fillStyle = color
  const ls = wrapLines((m) => ctx.measureText(m).width, t, maxW, max)
  for (const l of ls) {
    ctx.fillText(l, x, y)
    y += size * lh
  }
  return y
}
function watermark(ctx: Ctx, list: ListProject, W: number, color: string) {
  const t = list.watermark?.text || (list.publisher.handle ? `@${list.publisher.handle}` : list.publisher.name)
  if (!t) return
  const k = W / 1080
  ctx.globalAlpha = list.watermark?.opacity ?? 0.85
  text(ctx, t, W - 40 * k, 40 * k, Math.round(30 * k), FONT_XB, color, W * 0.6, 'right')
  ctx.globalAlpha = 1
}
const monthOf = (r: EvRow) => r.mon
const dateRange = (rows: EvRow[]) => {
  const a = rows[0]
  const b = rows[rows.length - 1]
  if (!a) return ''
  if (!b || a === b) return `${a.day} ${a.mon}`
  return a.mon === b.mon ? `${a.day}–${b.day} ${a.mon}` : `${a.day} ${a.mon} – ${b.day} ${b.mon}`
}

type Pal = { accent: string; bg: string; text: string }
type Env = { ctx: Ctx; W: number; H: number; k: number; v: boolean; list: ListProject; pal: Pal }

// ── K1 büyük isim ──
function k1(e: Env, item: ListItem, r: EvRow, photo: Photo) {
  const { ctx, W, H, k, pal } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  const name = up(item.title)
  const ns = fit(ctx, name.split(' ').sort((a, b) => b.length - a.length)[0] ?? name, AD_FONT_BEBAS, Math.round(300 * k), W - 80 * k, Math.round(120 * k))
  const y = lines(ctx, name, 40 * k, 90 * k, ns, AD_FONT_BEBAS, pal.text, W - 80 * k, 2, 0.86)
  const pw = W * 0.55
  const ph = H - y - 20 * k
  clipRound(ctx, 50 * k, y + 20 * k, pw, ph, pw / 2, () => cover(ctx, photo, 50 * k, y + 20 * k, pw, ph + pw / 2, pal.accent))
  const cx = W - 50 * k - W * 0.32
  const cw = W * 0.32
  const by = y + 60 * k
  ctx.strokeStyle = pal.text
  ctx.lineWidth = 5 * k
  ctx.strokeRect(cx, by, cw, 260 * k)
  text(ctx, r.day || '•', cx + cw / 2, by + 20 * k, Math.round(150 * k), AD_FONT_BEBAS, pal.text, cw, 'center')
  text(ctx, up(r.mon || ''), cx + cw / 2, by + 170 * k, Math.round(64 * k), AD_FONT_BEBAS, pal.text, cw, 'center')
  let yy = by + 300 * k
  yy = lines(ctx, up(r.city || ''), cx, yy, Math.round(60 * k), AD_FONT_BEBAS, pal.text, cw, 1)
  yy = lines(ctx, r.venue, cx, yy + 4 * k, Math.round(30 * k), FONT_XB, pal.text, cw, 3, 1.2)
  text(ctx, [dayShort(r.date), r.time].filter(Boolean).join(' · '), cx, yy + 14 * k, Math.round(30 * k), FONT_MD, pal.text, cw)
  ctx.fillStyle = pal.accent
  ctx.fillRect(cx, yy + 70 * k, cw, 64 * k)
  text(ctx, 'BİLETLER SATIŞTA', cx + cw / 2, yy + 86 * k, Math.round(28 * k), FONT_XB, isLight(pal.accent) ? '#111' : '#fff', cw - 20 * k, 'center')
}

// ── K4 bilet koçanı ──
function k4(e: Env, item: ListItem, r: EvRow) {
  const { ctx, W, H, k, pal } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  text(ctx, 'BİLETİN HAZIR MI?', W / 2, 110 * k, Math.round(92 * k), AD_FONT_BEBAS, isLight(pal.bg) ? '#111' : '#fff', W - 80 * k, 'center')
  const tw = W * 0.8
  const th = Math.min(H - 330 * k, 1150 * k)
  const tx = (W - tw) / 2
  const ty = 260 * k
  ctx.save()
  ctx.translate(W / 2, ty + th / 2)
  ctx.rotate(-0.05)
  ctx.translate(-W / 2, -(ty + th / 2))
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 40 * k
  ctx.fillStyle = '#fbf7ef'
  roundRectPath(ctx, tx, ty, tw, th, 36 * k)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  const p = 56 * k
  text(ctx, 'GİRİŞ · TEK KİŞİLİK', tx + p, ty + p, Math.round(30 * k), FONT_XB, pal.accent)
  const ns = fit(ctx, up(item.title).split(' ').sort((a, b) => b.length - a.length)[0] ?? '', AD_FONT_BEBAS, Math.round(150 * k), tw - p * 2, Math.round(60 * k))
  let y = lines(ctx, up(item.title), tx + p, ty + p + 50 * k, ns, AD_FONT_BEBAS, pal.text, tw - p * 2, 2, 0.92)
  y = lines(ctx, item.event?.category ?? '', tx + p, y + 10 * k, Math.round(36 * k), FONT_XB, pal.text, tw - p * 2, 1)
  const col = (tw - p * 2) / 2
  const cell = (lab: string, val: string, cx: number, cy: number) => {
    text(ctx, lab, cx, cy, Math.round(26 * k), FONT_MD, hexA(pal.text, 0.6))
    lines(ctx, val, cx, cy + 34 * k, Math.round(40 * k), FONT_XB, pal.text, col - 20 * k, 2, 1.1)
  }
  const gy = y + 40 * k
  cell('TARİH', [r.day, r.mon].filter(Boolean).join(' ') || r.date, tx + p, gy)
  cell('SAAT', r.time || '—', tx + p + col, gy)
  cell('MEKÂN', r.venue, tx + p, gy + 150 * k)
  cell('ŞEHİR', up(r.city), tx + p + col, gy + 150 * k)
  const dy = ty + th - 240 * k
  ctx.strokeStyle = '#b9b1a3'
  ctx.lineWidth = 4 * k
  ctx.setLineDash([16 * k, 12 * k])
  ctx.beginPath()
  ctx.moveTo(tx + 24 * k, dy)
  ctx.lineTo(tx + tw - 24 * k, dy)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = pal.bg
  ctx.beginPath()
  ctx.arc(tx, dy, 34 * k, 0, Math.PI * 2)
  ctx.arc(tx + tw, dy, 34 * k, 0, Math.PI * 2)
  ctx.fill()
  for (let i = 0; i < 46; i++) {
    const w = (i * 7) % 3 === 0 ? 8 * k : 4 * k
    ctx.fillStyle = '#111'
    ctx.fillRect(tx + p + i * 9 * k, dy + 60 * k, w, 110 * k)
  }
  text(ctx, item.event?.price || item.price ? `BİLET: ${item.event?.price || item.price}` : (item.event?.source ? `BİLET: ${item.event.source}` : ''), tx + tw - p, dy + 90 * k, Math.round(30 * k), FONT_XB, pal.text, tw * 0.4, 'right')
  ctx.restore()
  watermark(ctx, e.list, W, isLight(pal.bg) ? '#111' : '#fff')
}

// ── K6 İsviçre ızgara ──
function k6(e: Env, item: ListItem, r: EvRow, photo: Photo) {
  const { ctx, W, H, k, pal } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  const p = 60 * k
  text(ctx, up(item.event?.category || 'ETKİNLİK'), p, p, Math.round(30 * k), FONT_XB, pal.text)
  const longest = item.title.split(' ').sort((a, b) => b.length - a.length)[0] ?? item.title
  const ts = fit(ctx, longest, FONT_XB, Math.round((H < W ? 170 : 230) * k), W - p * 2, Math.round(70 * k))
  const y = lines(ctx, item.title, p, p + 110 * k, ts, FONT_XB, pal.text, W - p * 2, 3, 0.86)
  const d = Math.min(W * 0.42, H - y - 330 * k)
  const cx = W - p - d / 2
  const cy = y + 40 * k + d / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
  ctx.clip()
  if (photo) cover(ctx, photo, cx - d / 2, cy - d / 2, d, d, pal.accent)
  else {
    ctx.fillStyle = pal.accent
    ctx.fillRect(cx - d / 2, cy - d / 2, d, d)
  }
  ctx.restore()
  if (photo) {
    ctx.strokeStyle = pal.accent
    ctx.lineWidth = 16 * k
    ctx.beginPath()
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
    ctx.stroke()
  }
  lines(ctx, item.subtitle && item.subtitle !== r.venue ? item.subtitle : (item.announce || '').slice(0, 90), p, y + 60 * k, Math.round(34 * k), FONT_MD, pal.text, W - p * 3 - d, 4, 1.3)
  const by = H - 190 * k
  const cols: Array<[string, string]> = [['TARİH', [r.day, r.mon].filter(Boolean).join(' ')], ['SAAT', r.time || '—'], ['MEKÂN', `${r.city} · ${r.venue}`]]
  const cw = (W - p * 2 - 40 * k) / 4
  let x = p
  cols.forEach(([lab, val], i) => {
    const w = i === 2 ? cw * 2 : cw
    ctx.fillStyle = pal.text
    ctx.fillRect(x, by, w, 5 * k)
    text(ctx, lab, x, by + 20 * k, Math.round(26 * k), FONT_XB, pal.text)
    text(ctx, val, x, by + 60 * k, Math.round(40 * k), FONT_XB, pal.text, w - 10 * k)
    x += w + 20 * k
  })
  watermark(ctx, e.list, W, pal.text)
}

// ── K7 risograf ──
function k7(e: Env, item: ListItem, r: EvRow, photo: Photo) {
  const { ctx, W, H, k, pal } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  const R = Math.min(W, H) * 0.42
  const cx = W * 0.58
  const cy = H * 0.5
  ctx.fillStyle = pal.accent
  const step = 26 * k
  for (let y = cy - R; y < cy + R; y += step) for (let x = cx - R; x < cx + R; x += step) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue
    ctx.beginPath()
    ctx.arc(x, y, step * 0.36, 0, Math.PI * 2)
    ctx.fill()
  }
  const r2 = R * 0.78
  ctx.save()
  ctx.beginPath()
  ctx.arc(W * 0.36, H * 0.56, r2, 0, Math.PI * 2)
  ctx.clip()
  if (photo) {
    cover(ctx, photo, W * 0.36 - r2, H * 0.56 - r2, r2 * 2, r2 * 2, pal.text)
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = pal.text
    ctx.globalAlpha = 0.55
    ctx.fillRect(W * 0.36 - r2, H * 0.56 - r2, r2 * 2, r2 * 2)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  } else {
    ctx.globalAlpha = 0.85
    ctx.fillStyle = pal.text
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }
  ctx.restore()
  const p = 54 * k
  const ts = fit(ctx, up(item.title).split(' ').sort((a, b) => b.length - a.length)[0] ?? '', AD_FONT_GROTESK, Math.round(130 * k), W - p * 2, Math.round(60 * k))
  lines(ctx, up(item.title), p, p + 30 * k, ts, AD_FONT_GROTESK, pal.text, W - p * 2, 2, 1)
  text(ctx, up(item.event?.category || ''), p, p + 30 * k + ts * 2.1, Math.round(40 * k), AD_FONT_GROTESK, pal.accent)
  const by = H - 230 * k
  text(ctx, up([dayShort(r.date), r.time].filter(Boolean).join(' ')), p, by, Math.round(80 * k), AD_FONT_GROTESK, pal.text, W - p * 2)
  text(ctx, `${r.city} · ${r.venue}`, p, by + 100 * k, Math.round(40 * k), FONT_XB, pal.text, W - p * 2)
  watermark(ctx, e.list, W, pal.text)
}

// ── K2 hafta sonu, K10 sahne saatleri ──
async function kList(e: Env, rows: Array<{ item: ListItem; r: EvRow; photo: Photo }>, variant: 'haftasonu' | 'saatler') {
  const { ctx, W, H, k, pal, list } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  if (variant === 'haftasonu') {
    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    for (let x = 0; x < W; x += 80 * k) ctx.fillRect(x, 0, 38 * k, H)
  }
  const p = 56 * k
  let y = 70 * k
  const handle = list.watermark?.text || (list.publisher.handle ? `@${list.publisher.handle}` : list.publisher.name)
  if (variant === 'haftasonu') {
    text(ctx, handle, W / 2, y, Math.round(64 * k), AD_FONT_SERIF, pal.text, W - p * 2, 'center')
    y += 100 * k
    const city = up(rows[0]?.r.city || '')
    if (city) {
      ctx.font = `${Math.round(30 * k)}px ${FONT_XB}`
      const cw = ctx.measureText(city).width + 50 * k
      ctx.fillStyle = pal.text
      ctx.fillRect((W - cw) / 2, y, cw, 54 * k)
      text(ctx, city, W / 2, y + 12 * k, Math.round(30 * k), FONT_XB, pal.bg, cw, 'center')
      y += 90 * k
    }
    text(ctx, up(list.introTitle || 'Bu hafta sonu!'), W / 2, y, Math.round(120 * k), AD_FONT_BEBAS, pal.text, W - p * 2, 'center')
    y += 140 * k
  } else {
    text(ctx, up(list.introSubtitle || rows[0]?.r.city || ''), p, y, Math.round(32 * k), FONT_XB, pal.accent, W - p * 2)
    y += 50 * k
    y = lines(ctx, up(list.introTitle || 'Etkinlik saatleri'), p, y, Math.round(120 * k), AD_FONT_BEBAS, pal.text, W - p * 2, 2, 0.95) + 30 * k
    watermark(ctx, list, W, pal.text)
  }
  const avail = H - y - 90 * k
  const n = rows.length
  let lastDate = ''
  const heads = variant === 'haftasonu' ? new Set(rows.map((x) => x.r.date)).size : 0
  const rowH = Math.min(variant === 'haftasonu' ? 230 * k : 190 * k, (avail - heads * 74 * k) / Math.max(1, n) - 16 * k)
  for (const { item, r, photo } of rows) {
    if (variant === 'haftasonu' && r.date !== lastDate) {
      text(ctx, up(r.date), p, y, Math.round(56 * k), AD_FONT_BEBAS, pal.text, W - p * 2)
      y += 74 * k
      lastDate = r.date
    }
    if (variant === 'haftasonu') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(p, y, W - p * 2, rowH)
      const pw = rowH * 1.4
      cover(ctx, photo, p + 10 * k, y + 10 * k, pw, rowH - 20 * k, pal.bg)
      const tx = p + pw + 30 * k
      const ts = fit(ctx, up(item.title), AD_FONT_BEBAS, Math.round(rowH * 0.34), W - p - tx - 170 * k, Math.round(30 * k))
      lines(ctx, up(item.title), tx, y + rowH * 0.18, ts, AD_FONT_BEBAS, '#111', W - p - tx - 170 * k, 2, 0.95)
      text(ctx, up(item.event?.category || ''), W - p - 30 * k, y + rowH * 0.25, Math.round(26 * k), FONT_XB, '#111', 150 * k, 'right')
      text(ctx, r.time || '', W - p - 30 * k, y + rowH * 0.25 + 40 * k, Math.round(rowH * 0.24), AD_FONT_BEBAS, '#111', 150 * k, 'right')
    } else {
      const hi = rows[rows.length - 1]?.item === item
      ctx.fillStyle = hi ? pal.accent : hexA('#ffffff', 0.12)
      ctx.fillRect(p + 150 * k, y, W - p * 2 - 150 * k, rowH)
      const col = hi && isLight(pal.accent) ? '#111' : pal.text
      text(ctx, r.time || r.dayShort, p, y + 16 * k, Math.round(44 * k), FONT_XB, hexA(pal.text, 0.8), 140 * k)
      const tx = p + 180 * k
      const ts = fit(ctx, item.title, FONT_XB, Math.round(Math.min(56 * k, rowH * 0.36)), W - p - tx - 20 * k, Math.round(26 * k))
      text(ctx, item.title, tx, y + rowH * 0.16, ts, FONT_XB, col, W - p - tx - 20 * k)
      text(ctx, [dayShort(r.date), r.venue].filter(Boolean).join(' · '), tx, y + rowH * 0.16 + ts + 12 * k, Math.round(Math.min(32 * k, rowH * 0.2)), FONT_MD, col, W - p - tx - 20 * k)
    }
    y += rowH + 16 * k
  }
  if (variant === 'haftasonu') {
    const src = [...new Set(rows.map((x) => x.item.event?.source).filter(Boolean))].join(' · ')
    if (src) text(ctx, `BİLETLER: ${up(src)}`, W / 2, H - 70 * k, Math.round(28 * k), FONT_XB, pal.text, W - p * 2, 'center')
  } else text(ctx, 'Saatler değişebilir · kaydet, yanında olsun', p, H - 70 * k, Math.round(28 * k), FONT_XB, hexA(pal.text, 0.8), W - p * 2)
}

// ── K3 festival ──
function k3(e: Env, rows: EvRow[]) {
  const { ctx, W, H, k, pal, list } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = pal.accent
  ctx.beginPath()
  ctx.arc(W + 30 * k, -30 * k, 360 * k, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f472b6'
  ctx.beginPath()
  ctx.arc(-60 * k, H * 0.7, 300 * k, 0, Math.PI * 2)
  ctx.fill()
  const p = 60 * k
  let y = 150 * k
  text(ctx, up(list.introSubtitle || 'Festival'), p, y, Math.round(34 * k), FONT_XB, pal.text, W - p * 2)
  y += 50 * k
  y = lines(ctx, up(list.introTitle || 'Festival'), p, y, Math.round(170 * k), AD_FONT_BEBAS, pal.text, W - p * 2, 2, 0.9)
  const chip = up(`${rows[0]?.city ?? ''} · ${dateRange(rows)}`)
  ctx.font = `${Math.round(36 * k)}px ${FONT_XB}`
  const cw = Math.min(W - p * 2, ctx.measureText(chip).width + 40 * k)
  ctx.fillStyle = pal.accent
  ctx.fillRect(p, y + 10 * k, cw, 62 * k)
  text(ctx, chip, p + 20 * k, y + 22 * k, Math.round(36 * k), FONT_XB, isLight(pal.accent) ? pal.bg : '#fff', cw - 40 * k)
  y += 110 * k
  const groups: Array<{ head: EvRow; names: string[] }> = []
  for (const r of rows) {
    const g = groups.find((x) => x.head.date === r.date)
    if (g) g.names.push(r.title)
    else groups.push({ head: r, names: [r.title] })
  }
  const gh = Math.min(260 * k, (H - y - 120 * k) / Math.max(1, groups.length) - 20 * k)
  for (const g of groups) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    roundRectPath(ctx, p, y, W - p * 2, gh, 24 * k)
    ctx.fill()
    text(ctx, g.head.day, p + 30 * k, y + 24 * k, Math.round(gh * 0.36), AD_FONT_BEBAS, pal.text, 160 * k)
    text(ctx, g.head.dayShort, p + 30 * k, y + 24 * k + gh * 0.38, Math.round(gh * 0.16), FONT_XB, pal.text, 160 * k)
    const tx = p + 200 * k
    const first = up(g.names[0] ?? '')
    const fs = fit(ctx, first, AD_FONT_BEBAS, Math.round(gh * 0.3), W - p - tx - 30 * k, Math.round(30 * k))
    text(ctx, first, tx, y + 24 * k, fs, AD_FONT_BEBAS, pal.text, W - p - tx - 30 * k)
    if (g.names.length > 1) lines(ctx, up(g.names.slice(1).join(' · ')), tx, y + 30 * k + fs, Math.round(gh * 0.17), AD_FONT_BEBAS, hexA(pal.text, 0.85), W - p - tx - 30 * k, 2, 1.05)
    y += gh + 20 * k
  }
  text(ctx, up(rows[0]?.venue ?? ''), W / 2, H - 80 * k, Math.round(34 * k), FONT_XB, pal.text, W - p * 2, 'center')
  watermark(ctx, list, W, isLight(pal.accent) ? '#111' : pal.text)
}

// ── K5 ay takvimi ──
function k5(e: Env, rows: EvRow[], items: ListItem[]) {
  const { ctx, W, H, k, pal, list } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  const p = 50 * k
  const iso = items.map((x) => x.event?.startsAt).find(Boolean)
  const base = iso ? new Date(Date.parse(iso) + 3 * 3_600_000) : new Date(list.updatedAt + 3 * 3_600_000)
  const yr = base.getUTCFullYear()
  const mo = base.getUTCMonth()
  const MONTHS = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
  text(ctx, up(rows[0]?.city || list.introSubtitle || ''), p, 90 * k, Math.round(34 * k), FONT_XB, pal.accent, W - p * 2)
  text(ctx, MONTHS[mo]!, p, 140 * k, Math.round(170 * k), AD_FONT_BEBAS, pal.text, W - p * 2)
  text(ctx, list.introTitle || 'ayın etkinlik takvimi', p, 320 * k, Math.round(34 * k), FONT_MD, hexA(pal.text, 0.85), W - p * 2)
  const byDay = new Map<number, string>()
  items.forEach((x) => {
    const s = x.event?.startsAt
    if (!s) return
    const d = new Date(Date.parse(s) + 3 * 3_600_000)
    if (d.getUTCMonth() === mo && d.getUTCFullYear() === yr && !byDay.has(d.getUTCDate())) byDay.set(d.getUTCDate(), x.title)
  })
  const first = (new Date(Date.UTC(yr, mo, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate()
  const gx = p
  const gy = 400 * k
  const gw = W - p * 2
  const cw = (gw - 6 * 10 * k) / 7
  const rowsN = Math.ceil((first + days) / 7)
  const ch = Math.min(cw * 1.25, (H - gy - 160 * k) / rowsN - 10 * k)
  ;['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT', 'PAZ'].forEach((d, i) => text(ctx, d, gx + i * (cw + 10 * k) + cw / 2, gy, Math.round(24 * k), FONT_XB, hexA(pal.text, 0.7), cw, 'center'))
  for (let d = 1; d <= days; d++) {
    const idx = first + d - 1
    const x = gx + (idx % 7) * (cw + 10 * k)
    const y = gy + 44 * k + Math.floor(idx / 7) * (ch + 10 * k)
    const ev = byDay.get(d)
    ctx.fillStyle = ev ? pal.accent : hexA(isLight(pal.bg) ? '#000000' : '#ffffff', 0.08)
    roundRectPath(ctx, x, y, cw, ch, 12 * k)
    ctx.fill()
    const c = ev ? (isLight(pal.accent) ? '#111' : '#fff') : hexA(pal.text, 0.6)
    text(ctx, String(d), x + 10 * k, y + 8 * k, Math.round(Math.min(44 * k, ch * 0.4)), AD_FONT_BEBAS, c, cw - 16 * k)
    if (ev) lines(ctx, ev, x + 10 * k, y + ch * 0.48, Math.round(Math.min(19 * k, ch * 0.17)), FONT_XB, c, cw - 16 * k, 2, 1.05)
  }
  text(ctx, `${byDay.size} etkinlik · ${new Set(rows.map((r) => r.venue)).size} mekân`, p, H - 90 * k, Math.round(30 * k), FONT_XB, pal.text, W / 2)
  watermark(ctx, list, W, pal.text)
}

// ── K8 kolaj ──
function k8(e: Env, rows: Array<{ item: ListItem; r: EvRow; photo: Photo }>) {
  const { ctx, W, H, k, pal, list } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  text(ctx, `bu hafta ${rows[0]?.r.city ?? ''}'da…`, 60 * k, 90 * k, Math.round(64 * k), AD_FONT_SERIF, pal.accent, W - 120 * k)
  const spots = [
    { x: 0.07, y: 0.15, w: 0.5, rot: -0.1 },
    { x: 0.46, y: 0.24, w: 0.46, rot: 0.08 },
    { x: 0.16, y: 0.47, w: 0.5, rot: 0.03 },
  ]
  rows.slice(0, 3).forEach(({ r, photo }, i) => {
    const s = spots[i]!
    const w = W * s.w
    const ph = Math.min(w * 0.9, H * 0.22)
    const x = W * s.x
    const y = H * s.y
    ctx.save()
    ctx.translate(x + w / 2, y + ph / 2)
    ctx.rotate(s.rot)
    ctx.translate(-(x + w / 2), -(y + ph / 2))
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 30 * k
    ctx.fillStyle = '#fff'
    ctx.fillRect(x, y, w, ph + 110 * k)
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    cover(ctx, photo, x + 18 * k, y + 18 * k, w - 36 * k, ph - 18 * k, pal.accent)
    text(ctx, `${r.dayShort} · ${r.title}`, x + 24 * k, y + ph + 22 * k, Math.round(38 * k), AD_FONT_SERIF, '#1c1917', w - 48 * k)
    text(ctx, [r.time, r.venue].filter(Boolean).join(' · '), x + 24 * k, y + ph + 68 * k, Math.round(24 * k), FONT_MD, '#57534e', w - 48 * k)
    ctx.fillStyle = hexA(pal.accent, 0.75)
    ctx.fillRect(x + w / 2 - 70 * k, y - 20 * k, 140 * k, 40 * k)
    ctx.restore()
  })
  const n = rows.length
  const y = lines(ctx, `${n} GÜN ${n} ETKİNLİK`, 60 * k, H - 260 * k, Math.round(110 * k), AD_FONT_BEBAS, pal.text, W - 120 * k, 2, 0.95)
  text(ctx, `${dateRange(rows.map((x) => x.r))} · ${rows[0]?.r.city ?? ''}`, 60 * k, y + 10 * k, Math.round(36 * k), FONT_XB, pal.text, W - 120 * k)
  watermark(ctx, list, W, pal.text)
}

// ── K9 harita ──
function k9(e: Env, rows: EvRow[]) {
  const { ctx, W, H, k, pal, list } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 2 * k
  for (let x = 0; x < W; x += 64 * k) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y < H; y += 64 * k) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  ctx.save()
  ctx.translate(W / 2, H * 0.55)
  ctx.rotate(-0.3)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(-W, -45 * k, W * 2, 90 * k)
  ctx.rotate(1.5)
  ctx.fillStyle = 'rgba(255,255,255,0.09)'
  ctx.fillRect(-H, -30 * k, H * 2, 60 * k)
  ctx.restore()
  const p = 60 * k
  const y0 = lines(ctx, up(list.introTitle || 'Bu akşam nerede ne var?'), p, 110 * k, Math.round(120 * k), AD_FONT_BEBAS, pal.text, W - p * 2, 2, 0.95)
  text(ctx, `${rows[0]?.city ?? ''} · ${rows[0]?.date ?? ''}`, p, y0 + 10 * k, Math.round(34 * k), FONT_XB, hexA(pal.text, 0.8), W - p * 2)
  const pins = [[0.2, 0.42], [0.62, 0.55], [0.3, 0.7], [0.66, 0.82]]
  rows.slice(0, 4).forEach((r, i) => {
    const [fx, fy] = pins[i]!
    const x = W * fx
    const y = H * fy
    ctx.fillStyle = hexA(pal.accent, 0.3)
    ctx.beginPath()
    ctx.arc(x, y, 40 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = pal.accent
    ctx.beginPath()
    ctx.arc(x, y, 18 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 5 * k
    ctx.stroke()
    const bw = Math.min(W * 0.46, W - x - 60 * k)
    const left = x + bw + 60 * k > W ? x - bw - 50 * k : x + 50 * k
    ctx.fillStyle = '#fff'
    roundRectPath(ctx, left, y - 50 * k, bw, 100 * k, 16 * k)
    ctx.fill()
    text(ctx, `${r.venue}${r.time ? ` · ${r.time}` : ''}`, left + 18 * k, y - 38 * k, Math.round(28 * k), FONT_XB, '#111', bw - 36 * k)
    text(ctx, r.title, left + 18 * k, y + 4 * k, Math.round(28 * k), FONT_MD, '#111', bw - 36 * k)
  })
  text(ctx, `${Math.min(4, rows.length)} ETKİNLİK · KONUMLAR HARİTADA`, p, H - 80 * k, Math.round(30 * k), FONT_XB, pal.text, W - p * 2)
  watermark(ctx, list, W, pal.text)
}

// ── K11 kaydırmalı set ──
function k11Cover(e: Env, rows: EvRow[]) {
  const { ctx, W, H, k, pal, list } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  const p = 70 * k
  const y = lines(ctx, up(list.introTitle || `${rows[0]?.city ?? ''} hafta sonu`), p, H * 0.2, Math.round(200 * k), AD_FONT_BEBAS, pal.text, W - p * 2, 3, 0.9)
  text(ctx, `${rows.length} etkinlik · ${list.introSubtitle || dateRange(rows)}`, p, y + 20 * k, Math.round(40 * k), FONT_XB, pal.text, W - p * 2)
  ctx.fillStyle = pal.accent
  ctx.fillRect(p, H - 200 * k, 300 * k, 80 * k)
  text(ctx, 'KAYDIR →', p + 30 * k, H - 182 * k, Math.round(40 * k), FONT_XB, isLight(pal.accent) ? '#111' : '#fff', 260 * k)
  watermark(ctx, list, W, pal.text)
}
function k11Item(e: Env, item: ListItem, r: EvRow, photo: Photo, idx: number, total: number) {
  const { ctx, W, H, k, pal } = e
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  const ph = H * 0.56
  cover(ctx, photo, 0, 0, W, ph, pal.bg)
  ctx.fillStyle = pal.accent
  ctx.fillRect(50 * k, 50 * k, 170 * k, 170 * k)
  const c = isLight(pal.accent) ? '#111' : '#fff'
  text(ctx, r.day || '•', 135 * k, 62 * k, Math.round(96 * k), AD_FONT_BEBAS, c, 160 * k, 'center')
  text(ctx, r.dayShort, 135 * k, 166 * k, Math.round(34 * k), FONT_XB, c, 160 * k, 'center')
  const p = 60 * k
  let y = ph + 40 * k
  text(ctx, up([item.event?.category, r.time].filter(Boolean).join(' · ')), p, y, Math.round(32 * k), FONT_XB, '#57534e', W - p * 2)
  y = lines(ctx, up(item.title), p, y + 50 * k, Math.round(110 * k), AD_FONT_BEBAS, '#111', W - p * 2, 2, 0.95)
  const price = item.event?.price || item.price
  text(ctx, [r.venue, price ? `bilet ${price}` : ''].filter(Boolean).join(' · '), p, y + 14 * k, Math.round(36 * k), FONT_MD, '#44403c', W - p * 2)
  text(ctx, `${idx} / ${total}`, W - p, H - 80 * k, Math.round(30 * k), FONT_XB, '#a8a29e', 200 * k, 'right')
}
function k11End(e: Env) {
  const { ctx, W, H, k, pal, list } = e
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, W, H)
  text(ctx, 'HANGİSİNE', W / 2, H * 0.34, Math.round(150 * k), AD_FONT_BEBAS, pal.text, W - 100 * k, 'center')
  text(ctx, 'GİDİYORSUN?', W / 2, H * 0.34 + 150 * k, Math.round(150 * k), AD_FONT_BEBAS, pal.text, W - 100 * k, 'center')
  text(ctx, 'yorumlara yaz · arkadaşını etiketle', W / 2, H * 0.34 + 330 * k, Math.round(40 * k), FONT_MD, hexA(pal.text, 0.85), W - 100 * k, 'center')
  const h = list.watermark?.text || (list.publisher.handle ? `@${list.publisher.handle}` : list.publisher.name) || 'TAKİP ET'
  ctx.font = `${Math.round(40 * k)}px ${FONT_XB}`
  const bw = ctx.measureText(h).width + 80 * k
  ctx.fillStyle = pal.accent
  ctx.fillRect((W - bw) / 2, H * 0.34 + 420 * k, bw, 90 * k)
  text(ctx, h, W / 2, H * 0.34 + 444 * k, Math.round(40 * k), FONT_XB, isLight(pal.accent) ? '#111' : '#fff', bw, 'center')
}

/** Bütün kartları üretir: JPEG tamponları (sırasıyla). */
export async function renderEventCards(list: ListProject, root = process.cwd()): Promise<Buffer[]> {
  ensureAdFonts(root)
  const t = list.template as CardTemplate
  const info = TEMPLATE_INFO[t]
  const [W, H] = cardSize(list.aspect)
  const pal: Pal = { accent: list.accent, bg: list.bgColor, text: list.textColor }
  const all = evRows(list)
  const items = list.items
  const max = info.scope === 'all' ? (info.max ?? 8) : info.scope === 'set' ? (info.max ?? 8) : 10
  const used = items.slice(0, max)
  const needPhotos = ['k1-buyukisim', 'k2-haftasonu', 'k6-izgara', 'k7-risograf', 'k8-kolaj', 'k11-set'].includes(t)
  const photos = needPhotos ? await Promise.all(used.map((x) => itemPhoto(x))) : used.map(() => null)
  const rows = used.map((item, i) => ({ item, r: all[i]!, photo: photos[i] ?? null }))
  const frames: Array<(e: Env) => void | Promise<void>> = []
  if (info.scope === 'each') {
    for (const x of rows) {
      if (t === 'k1-buyukisim') frames.push((e) => k1(e, x.item, x.r, x.photo))
      else if (t === 'k4-bilet') frames.push((e) => k4(e, x.item, x.r))
      else if (t === 'k6-izgara') frames.push((e) => k6(e, x.item, x.r, x.photo))
      else frames.push((e) => k7(e, x.item, x.r, x.photo))
    }
  } else if (info.scope === 'set') {
    frames.push((e) => k11Cover(e, rows.map((x) => x.r)))
    rows.forEach((x, i) => frames.push((e) => k11Item(e, x.item, x.r, x.photo, i + 2, rows.length + 2)))
    frames.push((e) => k11End(e))
  } else if (t === 'k2-haftasonu') frames.push((e) => kList(e, rows, 'haftasonu'))
  else if (t === 'k10-saatler') frames.push((e) => kList(e, rows, 'saatler'))
  else if (t === 'k3-festival') frames.push((e) => k3(e, rows.map((x) => x.r)))
  else if (t === 'k5-takvim') frames.push((e) => k5(e, rows.map((x) => x.r), used))
  else if (t === 'k8-kolaj') frames.push((e) => k8(e, rows))
  else frames.push((e) => k9(e, rows.map((x) => x.r)))
  const out: Buffer[] = []
  for (const draw of frames.slice(0, cardCount(t, items.length))) {
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')
    ctx.textBaseline = 'top'
    await draw({ ctx, W, H, k: Math.min(W, H) / 1080, v: H > W * 1.2, list, pal })
    out.push(await canvas.encode('jpeg', 92))
  }
  return out
}

export { monthOf }
