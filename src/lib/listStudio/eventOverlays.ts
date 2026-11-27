import 'server-only'

/**
 * ETKİNLİK STÜDYOSU — video şablonlarının katmanları (tam kare saydam PNG):
 * giriş düzenleri (turne, hafta, geri sayım, line-up, bölünmüş, özet, takvim) ve
 * etkinlik bölümü düzenleri (büyük tarih, minimal, kinetik kelime, bilgi şeridi, altyazı).
 * NaHaber adı / logosu yoktur.
 */
import type { SKRSContext2D } from '@napi-rs/canvas'
import { FONT_MD, FONT_XB, roundRectPath } from '@/lib/reels/reelTheme'
import { wrapLines } from '@/lib/reels/timeline'
import { AD_FONT_BEBAS, AD_FONT_GROTESK, AD_FONT_SERIF } from '@/lib/adStudio/adText'
import type { EvRow, ListOverlay } from './listModel'

type O<T extends ListOverlay['type']> = Extract<ListOverlay, { type: T }>
const up = (s: string) => s.toLocaleUpperCase('tr-TR')
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
/** açık renk mi (yazıyı koyu yapmak için) */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160
}
export function fit(ctx: SKRSContext2D, text: string, family: string, start: number, maxW: number, min: number): number {
  let s = start
  ctx.font = `${s}px ${family}`
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 3
    ctx.font = `${s}px ${family}`
  }
  return s
}
function centerText(ctx: SKRSContext2D, t: string, cx: number, y: number) {
  ctx.fillText(t, cx - ctx.measureText(t).width / 2, y)
}
function shadow(ctx: SKRSContext2D, on: boolean, k: number) {
  ctx.shadowColor = on ? 'rgba(0,0,0,0.55)' : 'transparent'
  ctx.shadowBlur = on ? 18 * k : 0
}

// ── giriş düzenleri ──────────────────────────────────────────────────────────
function rowsFit(rows: EvRow[], max: number): EvRow[] {
  return rows.slice(0, max)
}

export function drawEvIntro(ctx: SKRSContext2D, W: number, H: number, o: O<'evintro'>): void {
  const k = Math.min(W, H) / 1080
  const vertical = H > W * 1.2
  const pad = 70 * k
  const maxW = W - pad * 2
  ctx.textBaseline = 'top'
  const txt = o.text
  const rows = o.rows

  if (o.variant === 'bolunmus') {
    const n = Math.min(3, Math.max(2, rows.length))
    const bandH = H / n
    for (let i = 0; i < n; i++) {
      const r = rows[i]
      if (!r) continue
      const y = i * bandH
      const g = ctx.createLinearGradient(0, y, 0, y + bandH)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.72)')
      ctx.fillStyle = g
      ctx.fillRect(0, y, W, bandH)
      if (i > 0) {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, y - 3 * k, W, 6 * k)
      }
      const right = i % 2 === 1
      const x = right ? W - pad : pad
      ctx.fillStyle = o.accent
      ctx.font = `${Math.round(34 * k)}px ${FONT_XB}`
      const l1 = up(`${r.date.split(' ').pop() ?? ''} · ${r.time}`.replace(/^ · | · $/g, ''))
      ctx.fillText(l1, right ? x - ctx.measureText(l1).width : x, y + bandH - 190 * k)
      const ts = fit(ctx, up(r.title), AD_FONT_BEBAS, Math.round(96 * k), maxW, Math.round(48 * k))
      ctx.font = `${ts}px ${AD_FONT_BEBAS}`
      ctx.fillStyle = txt
      const t = up(r.title)
      ctx.fillText(t, right ? x - ctx.measureText(t).width : x, y + bandH - 150 * k)
      ctx.font = `${Math.round(32 * k)}px ${FONT_MD}`
      ctx.fillText(r.venue, right ? x - ctx.measureText(r.venue).width : x, y + bandH - 150 * k + ts)
    }
    // ortadaki şerit: başlık
    const lab = up(o.title)
    ctx.font = `${Math.round(54 * k)}px ${AD_FONT_BEBAS}`
    const w = Math.min(W * 0.9, ctx.measureText(lab).width + 50 * k)
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate(-0.07)
    ctx.fillStyle = o.accent
    ctx.fillRect(-w / 2, -40 * k, w, 80 * k)
    ctx.fillStyle = isLight(o.accent) ? '#111' : '#fff'
    ctx.textBaseline = 'middle'
    centerText(ctx, lab, 0, 4 * k)
    ctx.restore()
    return
  }

  if (o.variant === 'ozet') {
    const g = ctx.createLinearGradient(0, H * 0.35, 0, H)
    g.addColorStop(0, hexA(o.bg, 0))
    g.addColorStop(1, hexA(o.bg, 0.95))
    ctx.fillStyle = g
    ctx.fillRect(0, H * 0.35, W, H * 0.65)
    ctx.fillStyle = o.accent
    ctx.font = `italic ${Math.round(64 * k)}px ${AD_FONT_SERIF}`
    ctx.fillText(o.subtitle || 'dün gece…', pad, H * 0.12)
    const head = up(o.title || `Teşekkürler ${o.city}!`)
    const hs = fit(ctx, head.split(' ').sort((a, b) => b.length - a.length)[0] ?? head, AD_FONT_BEBAS, Math.round(170 * k), maxW, Math.round(80 * k))
    ctx.font = `${hs}px ${AD_FONT_BEBAS}`
    const lines = wrapLines((s) => ctx.measureText(s).width, head, maxW, 3)
    let y = H * (vertical ? 0.62 : 0.5) - lines.length * hs * 0.9
    ctx.fillStyle = txt
    for (const l of lines) {
      ctx.fillText(l, pad, y)
      y += hs * 0.9
    }
    const next = rows[0]
    if (next) {
      ctx.font = `${Math.round(40 * k)}px ${FONT_XB}`
      ctx.fillStyle = txt
      ctx.fillText(`Sıradaki: ${next.title}`, pad, y + 30 * k)
      ctx.font = `${Math.round(34 * k)}px ${FONT_MD}`
      ctx.fillStyle = o.accent
      ctx.fillText([next.date, next.time, next.venue].filter(Boolean).join(' · '), pad, y + 84 * k)
    }
    return
  }

  // geri kalan düzenler: yarı saydam zemin paneli
  const solid = o.variant === 'takvim'
  ctx.fillStyle = hexA(o.bg, solid ? 0.96 : 0.82)
  ctx.fillRect(0, 0, W, H)

  if (o.variant === 'gerisayim') {
    ctx.fillStyle = o.accent
    ctx.font = `${Math.round(70 * k)}px ${AD_FONT_BEBAS}`
    centerText(ctx, up(o.subtitle || 'Yarın başlıyor'), W / 2, H * 0.14)
    const d = o.days ?? 0
    const big = d <= 0 ? 'BUGÜN' : String(d)
    const bs = fit(ctx, big, AD_FONT_BEBAS, Math.round((d <= 0 ? 260 : 460) * k), maxW, Math.round(120 * k))
    ctx.font = `${bs}px ${AD_FONT_BEBAS}`
    ctx.fillStyle = txt
    shadow(ctx, true, k)
    ctx.shadowColor = hexA(o.accent, 0.8)
    ctx.shadowBlur = 40 * k
    centerText(ctx, big, W / 2, H * 0.28)
    shadow(ctx, false, k)
    if (d > 0) {
      ctx.font = `${Math.round(92 * k)}px ${AD_FONT_BEBAS}`
      centerText(ctx, 'GÜN KALDI', W / 2, H * 0.28 + bs * 0.95)
    }
    const r = rows[0]
    if (r) {
      const by = H * (vertical ? 0.7 : 0.74)
      ctx.strokeStyle = o.accent
      ctx.lineWidth = 5 * k
      ctx.strokeRect(pad, by, maxW, 190 * k)
      const ts = fit(ctx, up(r.title), AD_FONT_BEBAS, Math.round(72 * k), maxW - 40 * k, Math.round(40 * k))
      ctx.font = `${ts}px ${AD_FONT_BEBAS}`
      ctx.fillStyle = txt
      centerText(ctx, up(r.title), W / 2, by + 28 * k)
      ctx.font = `${Math.round(36 * k)}px ${FONT_XB}`
      ctx.fillStyle = o.accent
      centerText(ctx, [r.date, r.time, r.venue].filter(Boolean).join(' · ').slice(0, 60), W / 2, by + 40 * k + ts)
    }
    return
  }

  // başlık bloğu (turne, hafta, line-up, takvim)
  let y = H * (vertical ? 0.07 : 0.06)
  if (o.variant === 'turne' || o.variant === 'lineup') {
    ctx.fillStyle = o.accent
    ctx.font = `${Math.round(34 * k)}px ${FONT_XB}`
    centerText(ctx, up(o.variant === 'turne' ? 'Biletler satışta' : 'Açıklandı'), W / 2, y)
    y += 52 * k
    const head = up(o.title)
    const hs = fit(ctx, head, AD_FONT_BEBAS, Math.round(190 * k), maxW, Math.round(80 * k))
    ctx.font = `${hs}px ${AD_FONT_BEBAS}`
    ctx.fillStyle = txt
    centerText(ctx, head, W / 2, y)
    y += hs * 0.95
    if (o.subtitle) {
      ctx.font = `${Math.round(36 * k)}px ${FONT_MD}`
      centerText(ctx, o.subtitle, W / 2, y)
      y += 56 * k
    }
  } else {
    ctx.fillStyle = o.variant === 'takvim' ? txt : o.accent
    ctx.font = `${Math.round(34 * k)}px ${FONT_XB}`
    ctx.fillText(up(o.subtitle || o.city), pad, y)
    y += 50 * k
    const head = up(o.title)
    const hs = fit(ctx, head.split(' ').sort((a, b) => b.length - a.length)[0] ?? head, AD_FONT_BEBAS, Math.round(150 * k), maxW, Math.round(70 * k))
    ctx.font = `${hs}px ${AD_FONT_BEBAS}`
    ctx.fillStyle = txt
    const lines = wrapLines((s) => ctx.measureText(s).width, head, maxW, 2)
    for (const l of lines) {
      ctx.fillText(l, pad, y)
      y += hs * 0.92
    }
  }
  y += 30 * k

  if (o.variant === 'turne') {
    ctx.fillStyle = o.accent
    roundRectPath(ctx, pad, y, maxW, 64 * k, 6 * k)
    ctx.fill()
    ctx.fillStyle = isLight(o.accent) ? '#111' : '#fff'
    ctx.font = `${Math.round(32 * k)}px ${FONT_XB}`
    ctx.textBaseline = 'middle'
    centerText(ctx, 'SON BİLETLER · ACELE ET', W / 2, y + 33 * k)
    ctx.textBaseline = 'top'
    y += 90 * k
    const list = rowsFit(rows, vertical ? 12 : 7)
    const rowH = Math.min(80 * k, (H - y - 80 * k) / Math.max(1, list.length))
    const fs = Math.round(Math.min(40 * k, rowH * 0.55))
    for (const r of list) {
      ctx.fillStyle = txt
      ctx.font = `${fs}px ${FONT_XB}`
      ctx.fillText(`${r.day}.${monthNum(r.mon)}`, pad, y)
      const city = up(r.city || '')
      ctx.fillText(city, pad + 150 * k, y)
      ctx.font = `${fs}px ${FONT_MD}`
      const vx = pad + 150 * k + ctx.measureText(city).width + 24 * k
      const v = wrapLines((s) => ctx.measureText(s).width, r.venue, W - pad - vx, 1)[0] ?? ''
      ctx.fillText(v, vx, y)
      y += rowH
    }
    return
  }

  if (o.variant === 'lineup') {
    const list = rowsFit(rows, 12)
    let size = Math.round(130 * k)
    for (let i = 0; i < list.length; i++) {
      const t = up(list[i]!.title)
      const s = fit(ctx, t, AD_FONT_BEBAS, size, maxW, Math.round(40 * k))
      ctx.font = `${s}px ${AD_FONT_BEBAS}`
      ctx.fillStyle = i === 0 ? o.accent : txt
      centerText(ctx, t, W / 2, y)
      y += s * 0.98
      size = Math.max(Math.round(58 * k), Math.round(size * 0.82))
      if (y > H - 140 * k) break
    }
    return
  }

  // hafta / takvim: gün kutulu satırlar
  const list = rowsFit(rows, vertical ? 8 : 5)
  const rowH = Math.min(150 * k, (H - y - 70 * k) / Math.max(1, list.length))
  for (const r of list) {
    const box = rowH - 18 * k
    if (o.variant === 'takvim') {
      ctx.fillStyle = o.accent
      ctx.font = `${Math.round(box * 0.62)}px ${AD_FONT_BEBAS}`
      ctx.fillText(r.dayShort, pad, y + box * 0.12)
      ctx.fillStyle = txt
      const tx = pad + box * 1.9
      const ts = fit(ctx, r.title, AD_FONT_BEBAS, Math.round(box * 0.42), W - pad - tx, Math.round(28 * k))
      ctx.font = `${ts}px ${AD_FONT_BEBAS}`
      ctx.fillText(r.title, tx, y + box * 0.12)
      ctx.font = `${Math.round(box * 0.22)}px ${FONT_MD}`
      ctx.fillText([r.time, r.venue].filter(Boolean).join(' · '), tx, y + box * 0.12 + ts)
      ctx.fillStyle = hexA(txt, 0.25)
      ctx.fillRect(pad, y + rowH - 6 * k, maxW, 3 * k)
    } else {
      ctx.fillStyle = hexA('#ffffff', 0.08)
      roundRectPath(ctx, pad - 14 * k, y, maxW + 28 * k, box, 18 * k)
      ctx.fill()
      ctx.fillStyle = o.accent
      roundRectPath(ctx, pad, y + 10 * k, box - 20 * k, box - 20 * k, 12 * k)
      ctx.fill()
      ctx.fillStyle = isLight(o.accent) ? '#111' : '#fff'
      ctx.font = `${Math.round((box - 20 * k) * 0.48)}px ${AD_FONT_BEBAS}`
      centerText(ctx, r.day || '•', pad + (box - 20 * k) / 2, y + 16 * k)
      ctx.font = `${Math.round((box - 20 * k) * 0.2)}px ${FONT_XB}`
      centerText(ctx, r.dayShort, pad + (box - 20 * k) / 2, y + 16 * k + (box - 20 * k) * 0.52)
      const tx = pad + box + 6 * k
      ctx.fillStyle = txt
      const ts = fit(ctx, r.title, FONT_XB, Math.round(box * 0.3), W - pad - tx, Math.round(24 * k))
      ctx.font = `${ts}px ${FONT_XB}`
      ctx.fillText(wrapLines((s) => ctx.measureText(s).width, r.title, W - pad - tx, 1)[0] ?? r.title, tx, y + box * 0.2)
      ctx.font = `${Math.round(box * 0.2)}px ${FONT_MD}`
      ctx.fillStyle = hexA(txt, 0.85)
      ctx.fillText([r.time, r.venue].filter(Boolean).join(' · ').slice(0, 48), tx, y + box * 0.2 + ts + 8 * k)
    }
    y += rowH
  }
}

const MONTHS3 = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA']
function monthNum(mon: string): string {
  const i = MONTHS3.indexOf(up(mon).slice(0, 3))
  return i >= 0 ? String(i + 1).padStart(2, '0') : mon
}

// ── etkinlik bölümü düzenleri ────────────────────────────────────────────────
export function drawEvBig(ctx: SKRSContext2D, W: number, H: number, o: O<'evbig'>): void {
  const k = Math.min(W, H) / 1080
  const maxW = W * 0.88
  const g = ctx.createLinearGradient(0, H * 0.3, 0, H)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.7)')
  ctx.fillStyle = g
  ctx.fillRect(0, H * 0.3, W, H * 0.7)
  ctx.textBaseline = 'top'
  shadow(ctx, true, k)
  let y = H * (H > W * 1.2 ? 0.42 : 0.3)
  const t = up(o.title)
  const ts = fit(ctx, t, AD_FONT_BEBAS, Math.round(150 * k), maxW, Math.round(70 * k))
  ctx.font = `${ts}px ${AD_FONT_BEBAS}`
  ctx.fillStyle = o.text
  centerText(ctx, t, W / 2, y)
  y += ts
  const parts = o.date.split(' ')
  const dd = parts[0] && parts[1] ? `${parts[0].padStart(2, '0')}.${monthNum(parts[1])}` : o.date
  ctx.font = `${Math.round(130 * k)}px ${AD_FONT_BEBAS}`
  ctx.fillStyle = o.accent
  centerText(ctx, dd + (o.time ? ` · ${o.time}` : ''), W / 2, y)
  y += 130 * k
  if (o.city) {
    ctx.font = `${Math.round(96 * k)}px ${AD_FONT_BEBAS}`
    ctx.fillStyle = o.text
    centerText(ctx, up(o.city), W / 2, y)
    y += 96 * k
  }
  ctx.font = `${Math.round(40 * k)}px ${FONT_XB}`
  ctx.fillStyle = o.accent
  const v = wrapLines((s) => ctx.measureText(s).width, up(o.venue), maxW, 1)[0] ?? ''
  centerText(ctx, v, W / 2, y + 6 * k)
  y += 80 * k
  shadow(ctx, false, k)
  ctx.font = `${Math.round(30 * k)}px ${FONT_XB}`
  const pill = 'BİLETLER SATIŞTA'
  const pw = ctx.measureText(pill).width + 60 * k
  ctx.strokeStyle = o.text
  ctx.lineWidth = 3 * k
  roundRectPath(ctx, (W - pw) / 2, y, pw, 64 * k, 32 * k)
  ctx.stroke()
  ctx.fillStyle = o.text
  ctx.textBaseline = 'middle'
  centerText(ctx, pill, W / 2, y + 33 * k)
}

export function drawEvMin(ctx: SKRSContext2D, W: number, H: number, o: O<'evmin'>): void {
  const k = Math.min(W, H) / 1080
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'
  ctx.shadowColor = 'rgba(255,255,255,0.55)'
  ctx.shadowBlur = 30 * k
  const t = o.title
  const ts = fit(ctx, t, AD_FONT_SERIF, Math.round(170 * k), W * 0.86, Math.round(60 * k))
  ctx.font = `italic ${ts}px ${AD_FONT_SERIF}`
  ctx.fillStyle = o.text
  const lines = wrapLines((s) => ctx.measureText(s).width, t, W * 0.86, 2)
  let y = H * 0.4 - (lines.length * ts) / 2
  for (const l of lines) {
    centerText(ctx, l, W / 2, y)
    y += ts
  }
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  // alt şerit: tarih | mekân
  const by = H - (H > W * 1.2 ? 330 : 220) * k
  const half = W / 2
  ctx.fillStyle = o.accent
  ctx.fillRect(half - 2 * k, by, 4 * k, 110 * k)
  ctx.fillStyle = o.text
  const parts = o.date.split(' ')
  const d1 = parts.slice(0, 2).join(' ')
  const d2 = parts.slice(2).join(' ')
  ctx.font = `${Math.round(54 * k)}px ${FONT_XB}`
  ctx.fillText(d1, half - 40 * k - ctx.measureText(d1).width, by)
  ctx.font = `${Math.round(40 * k)}px ${FONT_MD}`
  ctx.fillText(d2, half - 40 * k - ctx.measureText(d2).width, by + 64 * k)
  ctx.font = `${Math.round(54 * k)}px ${FONT_XB}`
  ctx.fillText(o.city || '', half + 40 * k, by)
  ctx.font = `${Math.round(40 * k)}px ${FONT_MD}`
  ctx.fillText(wrapLines((s) => ctx.measureText(s).width, o.venue, half - 80 * k, 1)[0] ?? '', half + 40 * k, by + 64 * k)
}

export function drawEvWord(ctx: SKRSContext2D, W: number, H: number, o: O<'evword'>): void {
  const k = Math.min(W, H) / 1080
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'
  const s = fit(ctx, o.word, AD_FONT_BEBAS, Math.round(330 * k * o.size), W * 0.9, Math.round(80 * k))
  ctx.font = `${s}px ${AD_FONT_BEBAS}`
  const lines = wrapLines((t) => ctx.measureText(t).width, o.word, W * 0.9, 3)
  ctx.fillStyle = o.accent
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 24 * k
  let y = H / 2 - ((lines.length - 1) * s * 0.92) / 2
  for (const l of lines) {
    centerText(ctx, l, W / 2, y)
    y += s * 0.92
  }
}

export function drawEvBar(ctx: SKRSContext2D, W: number, H: number, o: O<'evbar'>): void {
  const k = Math.min(W, H) / 1080
  const h = 150 * k
  const y = H - h - (H > W * 1.2 ? 120 : 50) * k
  const x = 60 * k
  const w = W - 120 * k
  ctx.fillStyle = '#ffffff'
  roundRectPath(ctx, x, y, w, h, 24 * k)
  ctx.fill()
  ctx.fillStyle = o.accent
  roundRectPath(ctx, x, y, 22 * k, h, 11 * k)
  ctx.fill()
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#111'
  const t = up(o.title)
  const ts = fit(ctx, t, AD_FONT_BEBAS, Math.round(64 * k), w - 70 * k, Math.round(34 * k))
  ctx.font = `${ts}px ${AD_FONT_BEBAS}`
  ctx.fillText(t, x + 46 * k, y + 22 * k)
  ctx.font = `${Math.round(32 * k)}px ${FONT_XB}`
  ctx.fillStyle = '#333'
  ctx.fillText([o.date, o.time, o.venue].filter(Boolean).join(' · ').slice(0, 56), x + 46 * k, y + 30 * k + ts)
  // üst rozet
  ctx.save()
  ctx.translate(60 * k, H * (H > W * 1.2 ? 0.1 : 0.08))
  ctx.rotate(-0.05)
  const lab = 'BUGÜN'
  const name = up(o.title)
  ctx.font = `${Math.round(62 * k)}px ${AD_FONT_BEBAS}`
  const bw = Math.min(W * 0.8, Math.max(ctx.measureText(lab).width, ctx.measureText(name).width) + 40 * k)
  ctx.fillStyle = o.accent
  ctx.fillRect(0, 0, bw, 138 * k)
  ctx.fillStyle = isLight(o.accent) ? '#111' : '#fff'
  ctx.fillText(lab, 20 * k, 10 * k)
  ctx.fillText(wrapLines((s) => ctx.measureText(s).width, name, bw - 40 * k, 1)[0] ?? '', 20 * k, 70 * k)
  ctx.restore()
}

export function drawEvSub(ctx: SKRSContext2D, W: number, H: number, o: O<'evsub'>): void {
  const k = Math.min(W, H) / 1080
  const size = Math.round(58 * k)
  ctx.font = `${size}px ${FONT_XB}`
  const lines = wrapLines((s) => ctx.measureText(s).width, o.text, W * 0.82, 2)
  ctx.textBaseline = 'top'
  let y = H * (H > W * 1.2 ? 0.62 : 0.6)
  for (const l of lines) {
    const w = ctx.measureText(l).width
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    roundRectPath(ctx, (W - w) / 2 - 18 * k, y - 8 * k, w + 36 * k, size + 18 * k, 10 * k)
    ctx.fill()
    ctx.fillStyle = '#fff'
    centerText(ctx, l, W / 2, y)
    y += size + 26 * k
  }
}

export function drawEventOverlay(ctx: SKRSContext2D, W: number, H: number, o: ListOverlay): boolean {
  if (o.type === 'evintro') drawEvIntro(ctx, W, H, o)
  else if (o.type === 'evbig') drawEvBig(ctx, W, H, o)
  else if (o.type === 'evmin') drawEvMin(ctx, W, H, o)
  else if (o.type === 'evword') drawEvWord(ctx, W, H, o)
  else if (o.type === 'evbar') drawEvBar(ctx, W, H, o)
  else if (o.type === 'evsub') drawEvSub(ctx, W, H, o)
  else return false
  return true
}

export const EVENT_FONTS = { AD_FONT_BEBAS, AD_FONT_GROTESK, AD_FONT_SERIF, FONT_XB, FONT_MD }
