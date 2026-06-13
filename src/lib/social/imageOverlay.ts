/**
 * Image Overlay — Sharp + SVG
 *
 * Haber görselinin üzerine:
 *  • Alt gradient bandı
 *  • NaHaber kırmızı rozeti
 *  • Manşet metni (max 2 satır)
 *  • nahaber.com watermark
 *
 * Çıktı: 1200×630 JPEG buffer (Facebook/Instagram için)
 */

import sharp from 'sharp'

const OUT_W = 1200
const OUT_H = 630
const PADDING = 36

/** Metni max-char sınırıyla en fazla 2 satıra böl */
function splitLines(text: string, maxCharsPerLine = 32): [string, string | null] {
  if (text.length <= maxCharsPerLine) return [text, null]

  // En yakın boşluktan kes
  let cut = maxCharsPerLine
  while (cut > 0 && text[cut] !== ' ') cut--
  if (cut === 0) cut = maxCharsPerLine

  const line1 = text.slice(0, cut).trim()
  const line2 = text.slice(cut).trim().slice(0, maxCharsPerLine)
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
  const [line1, line2] = splitLines(headline, 34)
  const hasTwo = line2 !== null

  const fontSize  = 42
  const lineH     = fontSize + 10

  // Metin alanı yüksekliği: 1 veya 2 satır
  const textBlockH = hasTwo ? lineH * 2 : lineH

  // Badge (NaHaber rozeti)
  const badgeH = 26
  const badgeW = 100
  const badgeY = height - PADDING - textBlockH - 14 - badgeH

  // Satır Y konumları (alttan yukarı)
  const y2 = height - PADDING                    // 2. satır baseline
  const y1 = hasTwo ? y2 - lineH : y2            // 1. satır baseline

  // Gradient başlangıcı: badge üstünden biraz daha yukarı
  const gradStart = Math.max(0, badgeY - 20)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
    </linearGradient>
  </defs>

  <!-- Gradient band -->
  <rect x="0" y="${gradStart}" width="${width}" height="${height - gradStart}" fill="url(#g)"/>

  <!-- NaHaber badge -->
  <rect x="${PADDING}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="5" fill="#e11d48"/>
  <text
    x="${PADDING + badgeW / 2}"
    y="${badgeY + badgeH / 2 + 1}"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="13"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
  >NaHaber</text>

  <!-- Headline line 1 -->
  <text
    x="${PADDING}"
    y="${y1}"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="${fontSize}"
    font-weight="900"
    fill="white"
    dominant-baseline="auto"
    style="text-shadow: 2px 2px 4px rgba(0,0,0,0.9)"
  >${esc(line1)}</text>

  ${hasTwo ? `<!-- Headline line 2 -->
  <text
    x="${PADDING}"
    y="${y2}"
    font-family="Arial Black, Arial, Helvetica, sans-serif"
    font-size="${fontSize}"
    font-weight="900"
    fill="white"
    dominant-baseline="auto"
    style="text-shadow: 2px 2px 4px rgba(0,0,0,0.9)"
  >${esc(line2!)}</text>` : ''}

  <!-- Watermark -->
  <text
    x="${width - PADDING}"
    y="${height - 12}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="13"
    fill="white"
    opacity="0.55"
    text-anchor="end"
  >nahaber.com</text>
</svg>`
}

/**
 * Downloads an image from `imageUrl`, composites the headline overlay,
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
    const svgStr = buildSvgOverlay(headline, OUT_W, OUT_H)
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
