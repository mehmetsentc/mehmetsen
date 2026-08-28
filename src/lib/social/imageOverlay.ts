/**
 * Image Overlay — Sharp + SVG Compositor (OnyediTivi Teması)
 *
 * Direct Node.js / Sharp card generation for:
 *  1. Story Cards: 1080×1920 (9:16 Instagram / Facebook Stories)
 *  2. Post Cards: 1080×1350 (4:5 Instagram / Facebook Feed Posts)
 *  3. Social Cards: 1200×630 (1.91:1 Social Link Previews)
 *
 * Layout features:
 *  • Full-bleed cover photo (contain+blur or top cover)
 *  • Smooth dark navy gradient scrim (#0d2355)
 *  • OnyediTivi 17 logo badge top-left
 *  • Category tag / SON DAKİKA badge with light-blue accent bar
 *  • Large bold news headline (Inter/system-ui)
 *  • Excerpt / summary text with divider line
 *  • Footer accent line with centered NaHaber icon
 */

import sharp from 'sharp'
import { readFile } from 'fs/promises'
import path from 'path'
import {
  clampCompleteSentences,
  overlayHeadlineFromTitle,
  pickCompleteOgHeadline,
} from './feedCaption'
import { getSocialPostCategoryLabel } from './socialPostCategory'
import { normalizeAbsoluteImageUrl } from './ogImageEmbed'

const NAVY = '#0d2355'
const LBLUE = '#62b8e8'

// Brand asset cache
let cachedOnyeditiviLogoBase64: string | null = null
let cachedNahaberIconBase64: string | null = null

async function getBrandAssetsBase64(): Promise<{
  onyeditiviLogo: string | null
  nahaberIcon: string | null
}> {
  if (cachedOnyeditiviLogoBase64 && cachedNahaberIconBase64) {
    return {
      onyeditiviLogo: cachedOnyeditiviLogoBase64,
      nahaberIcon: cachedNahaberIconBase64,
    }
  }

  try {
    const logoPath = path.join(process.cwd(), 'public/brand/onyeditivi/logo.png')
    const logoBuf = await readFile(logoPath)
    cachedOnyeditiviLogoBase64 = `data:image/png;base64,${logoBuf.toString('base64')}`
  } catch {
    cachedOnyeditiviLogoBase64 = null
  }

  const iconCandidates = [
    'public/brand/cities/canakkale/icon-192.png',
    'public/brand/icon-192.png',
  ]
  for (const candidate of iconCandidates) {
    try {
      const iconPath = path.join(process.cwd(), candidate)
      const iconBuf = await readFile(iconPath)
      cachedNahaberIconBase64 = `data:image/png;base64,${iconBuf.toString('base64')}`
      break
    } catch {
      // try next candidate
    }
  }

  return {
    onyeditiviLogo: cachedOnyeditiviLogoBase64,
    nahaberIcon: cachedNahaberIconBase64,
  }
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapTextToLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if (!current) {
      current = word
    } else if ((current + ' ' + word).length <= maxCharsPerLine) {
      current += ' ' + word
    } else {
      lines.push(current)
      if (lines.length >= maxLines) {
        current = ''
        break
      }
      current = word
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current)
  }
  return lines
}

async function prepareBackgroundBuffer(
  imageSource: Buffer | string,
  targetW: number,
  targetH: number,
): Promise<Buffer> {
  let buf: Buffer
  if (Buffer.isBuffer(imageSource)) {
    buf = imageSource
  } else {
    const url = normalizeAbsoluteImageUrl(imageSource)
    if (!url) {
      return await sharp({
        create: {
          width: targetW,
          height: targetH,
          channels: 4,
          background: { r: 13, g: 35, b: 85, alpha: 1 },
        },
      })
        .jpeg()
        .toBuffer()
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NaHaber-SocialBot/1.1; +https://www.nahaber.com)',
      },
    })
    if (!res.ok) {
      throw new Error(`Failed to fetch image: HTTP ${res.status}`)
    }
    buf = Buffer.from(await res.arrayBuffer())
  }

  const meta = await sharp(buf, { failOn: 'none' }).metadata()
  const srcW = meta.width ?? 1
  const srcH = meta.height ?? 1
  const srcAspect = srcW / srcH
  const targetAspect = targetW / targetH
  const ratio = srcAspect / targetAspect

  if (ratio < 0.85 || ratio > 1.18) {
    // Contain + Blur composite for extreme aspect ratio mismatch
    const bgBlur = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
      .blur(40)
      .toBuffer()

    const darkOverlay = Buffer.from(
      `<svg width="${targetW}" height="${targetH}">
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)"/>
      </svg>`
    )

    let fgW: number
    let fgH: number
    if (srcAspect > targetAspect) {
      fgW = targetW
      fgH = Math.round(targetW / srcAspect)
    } else {
      fgH = targetH
      fgW = Math.round(targetH * srcAspect)
    }

    const fg = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize(fgW, fgH, { fit: 'fill' })
      .toBuffer()

    const fgLeft = Math.round((targetW - fgW) / 2)
    const fgTop = Math.round((targetH - fgH) / 2)

    return await sharp(bgBlur)
      .composite([
        { input: darkOverlay, blend: 'over' },
        { input: fg, left: fgLeft, top: fgTop, blend: 'over' },
      ])
      .toBuffer()
  }

  return await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(targetW, targetH, { fit: 'cover', position: 'top' })
    .toBuffer()
}

export interface StoryCardOptions {
  imageSource: Buffer | string
  title: string
  summary?: string
  categoryId?: string
  isBreaking?: boolean
}

/**
 * 1080×1920 Instagram & Facebook Story kartı oluşturur.
 * (OnyediTivi tam tasarım: degrade scrim, kategori rozeti, manşet, özet, logo bar)
 */
export async function createStoryCardSharp(opts: StoryCardOptions): Promise<Buffer> {
  const W = 1080
  const H = 1920
  const PAD_X = 48
  const FOOTER_Y = 1860
  const FAVICON_SIZE = 40

  const brand = await getBrandAssetsBase64()
  const bg = await prepareBackgroundBuffer(opts.imageSource, W, H)

  const rawTitle = overlayHeadlineFromTitle(opts.title || '', 120, 160)
  const displayTitle = pickCompleteOgHeadline(rawTitle, opts.title || rawTitle, 120, 160)

  const categoryId = opts.categoryId || 'gundem'
  const isBreaking = opts.isBreaking || categoryId === 'son-dakika'
  const categoryLabel = getSocialPostCategoryLabel(categoryId, isBreaking)

  const cleanSummary = opts.summary
    ? clampCompleteSentences(opts.summary.replace(/\s+/g, ' ').trim(), 160, 200)
    : ''

  const titleLines = wrapTextToLines(displayTitle, 26, 3)
  const summaryLines = cleanSummary ? wrapTextToLines(cleanSummary, 52, 3) : []

  const titleFontSize = titleLines.length >= 3 ? 66 : titleLines.length === 2 ? 72 : 78
  const titleLineHeight = titleFontSize * 1.25

  const summaryFontSize = 32
  const summaryLineHeight = 46

  const summaryBlockHeight = summaryLines.length > 0 ? summaryLines.length * summaryLineHeight : 0
  const dividerGap = summaryLines.length > 0 ? 24 : 0
  const titleBlockHeight = titleLines.length * titleLineHeight
  const categoryGap = 20
  const categoryHeight = 32

  const summaryEndY = FOOTER_Y - 48
  const summaryStartY = summaryEndY - summaryBlockHeight
  const dividerY = summaryLines.length > 0 ? summaryStartY - dividerGap : summaryEndY
  const titleEndY = summaryLines.length > 0 ? dividerY - 24 : FOOTER_Y - 48
  const titleStartY = titleEndY - titleBlockHeight
  const categoryEndY = titleStartY - categoryGap
  const categoryStartY = categoryEndY - categoryHeight

  const SCRIM_TOP = Math.max(300, Math.min(categoryStartY - 160, 780))
  const SCRIM_HEIGHT = H - SCRIM_TOP

  const svgOverlay = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d2355" stop-opacity="0"/>
      <stop offset="18%" stop-color="#0d2355" stop-opacity="0.25"/>
      <stop offset="36%" stop-color="#0d2355" stop-opacity="0.65"/>
      <stop offset="52%" stop-color="#0d2355" stop-opacity="0.94"/>
      <stop offset="68%" stop-color="#0d2355" stop-opacity="0.99"/>
      <stop offset="100%" stop-color="#0d2355" stop-opacity="1"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Gradient Scrim covering bottom ~60% of image -->
  <rect x="0" y="${SCRIM_TOP}" width="${W}" height="${SCRIM_HEIGHT}" fill="url(#scrim)"/>

  <!-- OnyediTivi Logo Top-Left -->
  ${
    brand.onyeditiviLogo
      ? `<image href="${brand.onyeditiviLogo}" x="32" y="32" width="110" height="110" filter="url(#shadow)"/>`
      : ''
  }

  <!-- Category Bar + Badge -->
  <rect x="${PAD_X}" y="${categoryStartY}" width="4" height="${categoryHeight}" rx="2" fill="${LBLUE}"/>
  <text x="${PAD_X + 16}" y="${categoryStartY + 24}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff" letter-spacing="2.5">${esc(categoryLabel)}</text>

  <!-- Headline -->
  <g font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="${titleFontSize}" font-weight="800" fill="#ffffff">
    ${titleLines.map((line, i) => `<text x="${PAD_X}" y="${titleStartY + (i + 1) * titleLineHeight - 8}">${esc(line)}</text>`).join('\n    ')}
  </g>

  <!-- Divider Line + Summary (if available) -->
  ${
    summaryLines.length > 0
      ? `
  <rect x="${PAD_X}" y="${dividerY}" width="56" height="2" rx="1" fill="${LBLUE}"/>
  <rect x="${PAD_X + 56}" y="${dividerY}" width="${W - PAD_X * 2 - 56}" height="2" rx="1" fill="rgba(255,255,255,0.28)"/>
  <g font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="${summaryFontSize}" font-weight="400" fill="#ffffff">
    ${summaryLines.map((line, i) => `<text x="${PAD_X}" y="${summaryStartY + (i + 1) * summaryLineHeight - 8}">${esc(line)}</text>`).join('\n    ')}
  </g>`
      : ''
  }

  <!-- Footer Line + Centered Favicon -->
  <rect x="${PAD_X}" y="${FOOTER_Y + FAVICON_SIZE / 2 - 1}" width="${W - PAD_X * 2}" height="2" fill="${LBLUE}"/>
  <rect x="${(W - FAVICON_SIZE - 24) / 2}" y="${FOOTER_Y}" width="${FAVICON_SIZE + 24}" height="${FAVICON_SIZE}" fill="${NAVY}"/>
  ${
    brand.nahaberIcon
      ? `<image href="${brand.nahaberIcon}" x="${(W - FAVICON_SIZE) / 2}" y="${FOOTER_Y}" width="${FAVICON_SIZE}" height="${FAVICON_SIZE}"/>`
      : ''
  }
</svg>
`

  return await sharp(bg)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

export interface PostCardOptions {
  imageSource: Buffer | string
  title: string
  categoryId?: string
  isBreaking?: boolean
}

/**
 * 1080×1350 Instagram & Facebook Feed Post kartı oluşturur.
 * (OnyediTivi 4:5 feed card tasarımı)
 */
export async function createPostCardSharp(opts: PostCardOptions): Promise<Buffer> {
  const W = 1080
  const H = 1350
  const PAD_X = 48
  const FOOTER_Y = 1290
  const FAVICON_SIZE = 36

  const brand = await getBrandAssetsBase64()
  const bg = await prepareBackgroundBuffer(opts.imageSource, W, H)

  const rawTitle = overlayHeadlineFromTitle(opts.title || '', 120, 160)
  const displayTitle = pickCompleteOgHeadline(rawTitle, opts.title || rawTitle, 120, 160)

  const categoryId = opts.categoryId || 'gundem'
  const isBreaking = opts.isBreaking || categoryId === 'son-dakika'
  const categoryLabel = getSocialPostCategoryLabel(categoryId, isBreaking)

  const titleLines = wrapTextToLines(displayTitle, 28, 4)
  const titleFontSize = titleLines.length >= 4 ? 50 : titleLines.length === 3 ? 56 : 64
  const titleLineHeight = titleFontSize * 1.25

  const titleBlockHeight = titleLines.length * titleLineHeight
  const categoryGap = 16
  const categoryHeight = 28

  const titleEndY = FOOTER_Y - 40
  const titleStartY = titleEndY - titleBlockHeight
  const categoryEndY = titleStartY - categoryGap
  const categoryStartY = categoryEndY - categoryHeight

  const SCRIM_TOP = Math.max(200, Math.min(categoryStartY - 120, 560))
  const SCRIM_HEIGHT = H - SCRIM_TOP

  const svgOverlay = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d2355" stop-opacity="0"/>
      <stop offset="18%" stop-color="#0d2355" stop-opacity="0.25"/>
      <stop offset="36%" stop-color="#0d2355" stop-opacity="0.65"/>
      <stop offset="52%" stop-color="#0d2355" stop-opacity="0.94"/>
      <stop offset="68%" stop-color="#0d2355" stop-opacity="0.99"/>
      <stop offset="100%" stop-color="#0d2355" stop-opacity="1"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Gradient Scrim -->
  <rect x="0" y="${SCRIM_TOP}" width="${W}" height="${SCRIM_HEIGHT}" fill="url(#scrim)"/>

  <!-- OnyediTivi Logo Top-Left -->
  ${
    brand.onyeditiviLogo
      ? `<image href="${brand.onyeditiviLogo}" x="28" y="28" width="88" height="88" filter="url(#shadow)"/>`
      : ''
  }

  <!-- Category Bar + Badge -->
  <rect x="${PAD_X}" y="${categoryStartY}" width="4" height="${categoryHeight}" rx="2" fill="${LBLUE}"/>
  <text x="${PAD_X + 16}" y="${categoryStartY + 22}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="28" font-weight="800" fill="#ffffff" letter-spacing="2.5">${esc(categoryLabel)}</text>

  <!-- Headline -->
  <g font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="${titleFontSize}" font-weight="800" fill="#ffffff">
    ${titleLines.map((line, i) => `<text x="${PAD_X}" y="${titleStartY + (i + 1) * titleLineHeight - 6}">${esc(line)}</text>`).join('\n    ')}
  </g>

  <!-- Footer Line + Centered Favicon -->
  <rect x="${PAD_X}" y="${FOOTER_Y + FAVICON_SIZE / 2 - 1}" width="${W - PAD_X * 2}" height="2" fill="${LBLUE}"/>
  <rect x="${(W - FAVICON_SIZE - 20) / 2}" y="${FOOTER_Y}" width="${FAVICON_SIZE + 20}" height="${FAVICON_SIZE}" fill="${NAVY}"/>
  ${
    brand.nahaberIcon
      ? `<image href="${brand.nahaberIcon}" x="${(W - FAVICON_SIZE) / 2}" y="${FOOTER_Y}" width="${FAVICON_SIZE}" height="${FAVICON_SIZE}"/>`
      : ''
  }
</svg>
`

  return await sharp(bg)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

/** Legacy 1200×630 overlay */
export async function createSocialImage(
  imageUrl: string,
  headline: string
): Promise<Buffer | null> {
  try {
    return await createPostCardSharp({
      imageSource: imageUrl,
      title: headline,
    })
  } catch (err) {
    console.error('[imageOverlay] legacy error:', err)
    return null
  }
}
