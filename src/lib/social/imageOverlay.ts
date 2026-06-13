/**
 * Image Overlay — Sharp + SVG  (onyeditivi teması)
 *
 * Görsel tasarımı:
 *  • Koyu lacivert gradient (tüm görsel üzerine hafif)
 *  • Alt kısım: yarı saydam mavi bant (#0a2463 tonu)
 *  • Üst çizgi: ince kırmızı şerit (NaHaber kimliği)
 *  • NaHaber logosu — sağ üst köşe (onyeditivi stili)
 *  • Manşet metni — altta beyaz kalın yazı
 *  • nahaber.com watermark
 *
 * Çıktı: 1200×630 JPEG buffer (Facebook/Instagram için)
 */

import sharp from 'sharp'

const OUT_W = 1200
const OUT_H = 630

/** Metni max-char ile en fazla 2 satıra böl */
function splitLines(text: string, maxCharsPerLine = 36): [string, string | null] {
  if (text.length <= maxCharsPerLine) return [text, null]
  let cut = maxCharsPerLine
  while (cut > 0 && text[cut] !== ' ') cut--
  if (cut === 0) cut = maxCharsPerLine
  const line1 = text.slice(0, cut).trim()
  const line2  = text.slice(cut).trim().slice(0, maxCharsPerLine)
  return [line1, line2 || null]
}

/** XML özel karakterlerini kaçır */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSvgOverlay(headline: string, width: number, height: number): string {
  const [line1, line2] = splitLines(headline, 38)
  const hasTwo = line2 !== null

  // ── Boyutlar ────────────────────────────────────────────────────────────────
  const SIDE_PAD   = 32
  const FONT_SIZE  = 40
  const LINE_H     = FONT_SIZE + 12
  const TEXT_H     = hasTwo ? LINE_H * 2 + 8 : LINE_H

  // Mavi alt bant yüksekliği: metin + üst/alt boşluk
  const BAND_INNER_PAD = 20
  const BAND_H = TEXT_H + BAND_INNER_PAD * 2 + 10
  const BAND_Y = height - BAND_H

  // Metin Y pozisyonları (bant içinde)
  const TEXT_Y1 = BAND_Y + BAND_INNER_PAD + FONT_SIZE
  const TEXT_Y2 = TEXT_Y1 + LINE_H

  // Üst kırmızı çizgi
  const TOP_STRIPE_H = 6

  // NaHaber logo alanı (sağ üst)
  const LOGO_PAD   = 14
  const LOGO_H     = 34
  const LOGO_W     = 120
  const LOGO_X     = width - LOGO_W - LOGO_PAD
  const LOGO_Y     = LOGO_PAD + TOP_STRIPE_H + 4

  // Gradient: görsel üzerine hafif lacivert tonu (fotoğrafı tam öldürme)
  const GRAD_OPACITY_TOP = '0.20'
  const GRAD_OPACITY_MID = '0.35'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <!-- Tüm görsel: hafif lacivert tonu -->
    <linearGradient id="full" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#0a1f5c" stop-opacity="${GRAD_OPACITY_TOP}"/>
      <stop offset="60%"  stop-color="#071540" stop-opacity="${GRAD_OPACITY_MID}"/>
      <stop offset="100%" stop-color="#020b28" stop-opacity="0.55"/>
    </linearGradient>
    <!-- Mavi bant için ek gölge -->
    <filter id="shadow">
      <feDropShadow dx="0" dy="-4" stdDeviation="8" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- 1. Tam görsel lacivert tonu -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#full)"/>

  <!-- 2. Üst kırmızı çizgi (NaHaber kimliği) -->
  <rect x="0" y="0" width="${width}" height="${TOP_STRIPE_H}" fill="#e11d48"/>

  <!-- 3. NaHaber logo — sağ üst (onyeditivi stili köşe logo) -->
  <rect x="${LOGO_X}" y="${LOGO_Y}" width="${LOGO_W}" height="${LOGO_H}" rx="4" fill="#0a1f5c" opacity="0.85"/>
  <rect x="${LOGO_X}" y="${LOGO_Y}" width="4" height="${LOGO_H}" rx="2" fill="#e11d48"/>
  <text
    x="${LOGO_X + LOGO_W / 2 + 2}"
    y="${LOGO_Y + LOGO_H / 2}"
    font-family="Arial Black, Impact, Arial, Helvetica, sans-serif"
    font-size="14"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
    letter-spacing="1"
  >NaHaber</text>

  <!-- 4. Alt mavi bant (hafif mavi fon) -->
  <rect
    x="0" y="${BAND_Y}"
    width="${width}" height="${BAND_H}"
    fill="#0d2d6b"
    opacity="0.88"
    filter="url(#shadow)"
  />
  <!-- Bant üst kenara ince kırmızı çizgi -->
  <rect x="0" y="${BAND_Y}" width="${width}" height="3" fill="#e11d48" opacity="0.9"/>
  <!-- Bant sol taraf: dikey vurgu çizgisi -->
  <rect x="0" y="${BAND_Y}" width="5" height="${BAND_H}" fill="#e11d48"/>

  <!-- 5. Manşet — satır 1 -->
  <text
    x="${SIDE_PAD + 12}"
    y="${TEXT_Y1}"
    font-family="Arial Black, Impact, Arial, Helvetica, sans-serif"
    font-size="${FONT_SIZE}"
    font-weight="900"
    fill="white"
    dominant-baseline="auto"
    letter-spacing="0.5"
  >${esc(line1)}</text>

  ${hasTwo ? `<!-- Manşet — satır 2 -->
  <text
    x="${SIDE_PAD + 12}"
    y="${TEXT_Y2}"
    font-family="Arial Black, Impact, Arial, Helvetica, sans-serif"
    font-size="${FONT_SIZE}"
    font-weight="900"
    fill="#b8d4ff"
    dominant-baseline="auto"
    letter-spacing="0.5"
  >${esc(line2!)}</text>` : ''}

  <!-- 6. nahaber.com watermark — sağ alt bant içinde -->
  <text
    x="${width - SIDE_PAD}"
    y="${height - 12}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="13"
    fill="white"
    opacity="0.5"
    text-anchor="end"
    letter-spacing="0.5"
  >nahaber.com</text>
</svg>`
}

/**
 * Downloads an image from `imageUrl`, composites the onyeditivi-style overlay,
 * and returns a JPEG Buffer (1200×630).
 *
 * Returns null on any error (caller falls back to original URL).
 */
export async function createSocialImage(
  imageUrl: string,
  headline: string
): Promise<Buffer | null> {
  try {
    // 1 ─ Download
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'NaHaber-SocialBot/1.0' },
    })
    if (!res.ok) {
      console.warn(`[imageOverlay] HTTP ${res.status} for ${imageUrl}`)
      return null
    }
    const imgBuffer = Buffer.from(await res.arrayBuffer())

    // 2 ─ Resize to 1200×630, covering the full frame
    const base = await sharp(imgBuffer)
      .resize(OUT_W, OUT_H, { fit: 'cover', position: 'centre' })
      .toBuffer()

    // 3 ─ SVG overlay
    const svgStr  = buildSvgOverlay(headline, OUT_W, OUT_H)
    const overlay = Buffer.from(svgStr)

    // 4 ─ Composite SVG on top, export JPEG
    const final = await sharp(base)
      .composite([{ input: overlay, top: 0, left: 0 }])
      .jpeg({ quality: 88, progressive: true })
      .toBuffer()

    return final
  } catch (err) {
    console.error('[imageOverlay] error:', err)
    return null
  }
}
