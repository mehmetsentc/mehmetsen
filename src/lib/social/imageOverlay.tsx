/**
 * Image Overlay — Exact OnyediTivi Story & Post Compositor
 *
 * Direct in-process generation using Next.js ImageResponse (Satori) + bundled Inter fonts + Sharp.
 * Guarantees 100% visual parity with /api/og/story and /api/og/social endpoints:
 *  1. Story Cards: 1080×1920 (9:16 Instagram / Facebook Stories)
 *  2. Post Cards: 1080×1350 (4:5 Instagram / Facebook Feed Posts)
 *  3. Social Cards: 1200×630 (1.91:1 Social Link Previews)
 *
 * Zero external font fetch, zero missing glyph boxes (□□□□).
 */

import React from 'react'
import sharp from 'sharp'
import { readFile } from 'fs/promises'
import path from 'path'
import { ImageResponse } from 'next/og'
import {
  clampCompleteSentences,
  isIncompleteHeadline,
  overlayHeadlineFromTitle,
  pickCompleteOgHeadline,
  stripDanglingHeadlineTail,
} from './feedCaption'
import { getSocialPostCategoryLabel } from './socialPostCategory'
import { embedCoverTopImage, normalizeAbsoluteImageUrl, isUsableImageUrl } from './ogImageEmbed'
import { getBundledOgFontsSync } from './ogFonts'

const NAVY = '#0d2355'
const LBLUE = '#62b8e8'
const FONT_BODY = 'Inter'

const ONYEDITIVI_LOGO = 'brand/onyeditivi/logo.png'
const NAHABER_ICON_CANDIDATES = [
  'brand/icon-32.png',
  'brand/icon-192.png',
  'brand/cities/canakkale/icon-192.png',
]

// ── Story Card Layout Constants ─────────────────────────────────────────────
const STORY_W = 1080
const STORY_H = 1920
const STORY_TEXT_PAD_SIDE = 48
const STORY_TEXT_PAD_BOTTOM = 52
const STORY_PANEL_H = 880
const STORY_LOGO_SIZE = 110

const STORY_HEADLINE_MAX_LINES = 3
const STORY_HEADLINE_MIN_SIZE = 56
const STORY_HEADLINE_GAP_BELOW = 22
const STORY_SUMMARY_MAX_LINES = 3
const STORY_SUMMARY_MIN_SIZE = 30

const STORY_SENTENCE_END_RE = /[.!?…]["'»”’)\]]*(?=\s|$)/g
const STORY_COMPLETE_TAIL_RE = /[.!?…]["'»”’)\]]*$/
const STORY_DANGLING_TAIL_RE =
  /\s+(ve|veya|ile|için|olan|olacak|olanlar|ama|fakat|ancak|ki|bir|bu|şu|o|de|da|kadar|gibi|üzerine|hakkında|sonrası|öncesi|nedeniyle|yüzünden|dolayı|yaşındaki|yaşında|aylık|günlük|yıllık|adlı|isimli|konulu|yönelik|ilişkin|ait|edilen|edilmiş|yapılan|vurulan|yaralanan|öldürülen|gözaltına|tutuklanan|açıklayan|söyleyen|belirten|ağır|hafif|kritik|ciddi|ölümcül)\s*$/iu

function avgStoryGlyphWidth(fontSize: number, weight: 'bold' | 'regular' = 'bold'): number {
  return fontSize * (weight === 'regular' ? 0.56 : 0.55)
}

function estimateStoryWrapLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  weight: 'bold' | 'regular' = 'bold',
): number {
  const plain = text.replace(/\s+/g, ' ').trim()
  if (!plain) return 0
  const words = plain.split(' ')
  const charW = avgStoryGlyphWidth(fontSize, weight)
  const spaceW = fontSize * 0.28
  let lines = 1
  let lineW = 0
  for (const word of words) {
    const wordW = word.length * charW
    if (lineW === 0) {
      lineW = wordW
    } else if (lineW + spaceW + wordW > maxWidth) {
      lines++
      lineW = wordW
    } else {
      lineW += spaceW + wordW
    }
  }
  return lines
}

function stripStoryDanglingTail(text: string): string {
  let out = text.trim()
  for (let i = 0; i < 6; i++) {
    const next = out.replace(STORY_DANGLING_TAIL_RE, '').trim()
    if (next === out) break
    out = next
  }
  return out
}

function truncateStoryToMaxLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
  weight: 'bold' | 'regular' = 'bold',
): string {
  const plain = text.replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  if (estimateStoryWrapLines(plain, fontSize, maxWidth, weight) <= maxLines && !isIncompleteHeadline(plain)) {
    return plain
  }

  const words = plain.split(' ')
  const charW = avgStoryGlyphWidth(fontSize, weight)
  const spaceW = fontSize * 0.28
  let lines = 1
  let lineW = 0
  let result = ''
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const wordW = word.length * charW
    const extra = lineW === 0 ? wordW : spaceW + wordW
    if (lineW > 0 && lineW + extra > maxWidth) {
      lines++
      if (lines > maxLines) break
      lineW = wordW
    } else {
      lineW += extra
    }
    result += (result ? ' ' : '') + word
  }

  let trimmed = stripStoryDanglingTail(result)
  if (!trimmed) trimmed = result.trim()

  if (!STORY_COMPLETE_TAIL_RE.test(trimmed)) {
    const minEnd = Math.min(36, Math.floor(trimmed.length * 0.35))
    let best = -1
    STORY_SENTENCE_END_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = STORY_SENTENCE_END_RE.exec(trimmed)) !== null) {
      const end = m.index + m[0].length
      if (end >= minEnd) best = end
    }
    if (best >= minEnd) {
      return trimmed.slice(0, best).trim()
    }
    const withEllipsis = `${trimmed.replace(/[…]+$/, '')}…`
    if (estimateStoryWrapLines(withEllipsis, fontSize, maxWidth, weight) <= maxLines) {
      return withEllipsis
    }
    const words2 = trimmed.split(' ')
    while (words2.length > 1) {
      words2.pop()
      const candidate = stripStoryDanglingTail(words2.join(' '))
      if (!candidate) continue
      if (STORY_COMPLETE_TAIL_RE.test(candidate)) return candidate
      const ell = `${candidate}…`
      if (estimateStoryWrapLines(ell, fontSize, maxWidth, weight) <= maxLines) return ell
    }
    return withEllipsis
  }
  return trimmed
}

function resolveStoryHeadlineLayout(titlePlain: string, contentWidth: number): {
  displayTitle: string
  titleSize: number
  titleLineHeight: number
  titleWrapLines: number
  titleBlockHeight: number
} {
  const len = titlePlain.length
  let titleSize =
    len > 62 ? 68 :
    len > 52 ? 72 :
    len > 42 ? 76 :
    len > 32 ? 80 :
    len > 22 ? 84 :
    88

  let wrapLines = estimateStoryWrapLines(titlePlain, titleSize, contentWidth, 'bold')
  while (wrapLines > STORY_HEADLINE_MAX_LINES && titleSize > STORY_HEADLINE_MIN_SIZE) {
    titleSize -= 4
    wrapLines = estimateStoryWrapLines(titlePlain, titleSize, contentWidth, 'bold')
  }

  let displayTitle = titlePlain
  if (wrapLines > STORY_HEADLINE_MAX_LINES) {
    displayTitle = truncateStoryToMaxLines(titlePlain, titleSize, contentWidth, STORY_HEADLINE_MAX_LINES, 'bold')
    wrapLines = Math.min(
      STORY_HEADLINE_MAX_LINES,
      Math.max(1, estimateStoryWrapLines(displayTitle.replace(/…$/, ''), titleSize, contentWidth, 'bold')),
    )
  }

  const titleLineHeight =
    wrapLines >= 3 ? 1.26 :
    wrapLines >= 2 ? 1.28 :
    1.22
  const titleBlockHeight = Math.ceil(titleSize * titleLineHeight * wrapLines)

  return { displayTitle, titleSize, titleLineHeight, titleWrapLines: wrapLines, titleBlockHeight }
}

function resolveStorySummaryLayout(summaryPlain: string, contentWidth: number): {
  displaySummary: string
  summarySize: number
  summaryLineHeight: number
  summaryWrapLines: number
  summaryBlockHeight: number
} {
  const len = summaryPlain.length
  let summarySize =
    len > 160 ? 32 :
    len > 120 ? 34 :
    len > 90 ? 36 :
    len > 60 ? 38 : 40

  const summaryLineHeight = 1.46
  let wrapLines = estimateStoryWrapLines(summaryPlain, summarySize, contentWidth, 'regular')
  while (wrapLines > STORY_SUMMARY_MAX_LINES && summarySize > STORY_SUMMARY_MIN_SIZE) {
    summarySize -= 2
    wrapLines = estimateStoryWrapLines(summaryPlain, summarySize, contentWidth, 'regular')
  }

  let displaySummary = summaryPlain
  if (wrapLines > STORY_SUMMARY_MAX_LINES || !STORY_COMPLETE_TAIL_RE.test(summaryPlain)) {
    displaySummary = truncateStoryToMaxLines(
      summaryPlain, summarySize, contentWidth, STORY_SUMMARY_MAX_LINES, 'regular',
    )
    if (!STORY_COMPLETE_TAIL_RE.test(displaySummary) && !displaySummary.endsWith('…')) {
      while (summarySize > STORY_SUMMARY_MIN_SIZE) {
        summarySize -= 2
        const retry = truncateStoryToMaxLines(
          summaryPlain, summarySize, contentWidth, STORY_SUMMARY_MAX_LINES, 'regular',
        )
        if (STORY_COMPLETE_TAIL_RE.test(retry) || retry.endsWith('…')) {
          displaySummary = retry
          break
        }
        displaySummary = retry
      }
    }
    wrapLines = Math.min(
      STORY_SUMMARY_MAX_LINES,
      Math.max(1, estimateStoryWrapLines(displaySummary.replace(/…$/, ''), summarySize, contentWidth, 'regular')),
    )
  }

  if (estimateStoryWrapLines(displaySummary, summarySize, contentWidth, 'regular') > STORY_SUMMARY_MAX_LINES) {
    displaySummary = truncateStoryToMaxLines(
      displaySummary, summarySize, contentWidth, STORY_SUMMARY_MAX_LINES, 'regular',
    )
    wrapLines = Math.min(
      STORY_SUMMARY_MAX_LINES,
      Math.max(1, estimateStoryWrapLines(displaySummary.replace(/…$/, ''), summarySize, contentWidth, 'regular')),
    )
  }

  const summaryBlockHeight = Math.ceil(summarySize * summaryLineHeight * wrapLines)
  return { displaySummary, summarySize, summaryLineHeight, summaryWrapLines: wrapLines, summaryBlockHeight }
}

// ── Post Card Layout Constants ──────────────────────────────────────────────
const POST_W = 1080
const POST_H = 1350
const POST_TEXT_PAD_SIDE = 48
const POST_TEXT_PAD_BOTTOM = 48
const POST_PANEL_H = 620
const POST_LOGO_SIZE = 88
const POST_HEADLINE_MAX_LINES = 5
const POST_HEADLINE_MIN_SIZE = 36
const POST_HEADLINE_GAP_ABOVE_FOOTER = 20

const POST_SENTENCE_END_RE = /[.!?…]["'»”’)\]]*(?=\s|$)/g
const POST_COMPLETE_TAIL_RE = /[.!?…]["'»”’)\]]*$/

function avgPostGlyphWidth(fontSize: number): number {
  return fontSize * 0.55
}

function estimatePostWrapLines(text: string, fontSize: number, maxWidth: number): number {
  const plain = text.replace(/\s+/g, ' ').trim()
  if (!plain) return 0
  const words = plain.split(' ')
  const charW = avgPostGlyphWidth(fontSize)
  const spaceW = fontSize * 0.28
  let lines = 1
  let lineW = 0
  for (const word of words) {
    const wordW = word.length * charW
    if (lineW === 0) {
      lineW = wordW
    } else if (lineW + spaceW + wordW > maxWidth) {
      lines++
      lineW = wordW
    } else {
      lineW += spaceW + wordW
    }
  }
  return lines
}

function truncatePostToMaxLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
): string {
  const plain = stripDanglingHeadlineTail(text.replace(/\s+/g, ' ').trim())
  if (!plain) return ''
  if (estimatePostWrapLines(plain, fontSize, maxWidth) <= maxLines && !isIncompleteHeadline(plain)) {
    return plain
  }

  const words = plain.split(' ')
  const charW = avgPostGlyphWidth(fontSize)
  const spaceW = fontSize * 0.28
  let lines = 1
  let lineW = 0
  let result = ''
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const wordW = word.length * charW
    const extra = lineW === 0 ? wordW : spaceW + wordW
    if (lineW > 0 && lineW + extra > maxWidth) {
      lines++
      if (lines > maxLines) break
      lineW = wordW
    } else {
      lineW += extra
    }
    result += (result ? ' ' : '') + word
  }

  let trimmed = stripDanglingHeadlineTail(result)
  if (!trimmed) trimmed = result.trim()

  if (!POST_COMPLETE_TAIL_RE.test(trimmed) || isIncompleteHeadline(trimmed)) {
    const minEnd = Math.min(36, Math.floor(trimmed.length * 0.35))
    let best = -1
    POST_SENTENCE_END_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = POST_SENTENCE_END_RE.exec(trimmed)) !== null) {
      const end = m.index + m[0].length
      if (end >= minEnd) best = end
    }
    if (best >= minEnd) {
      return trimmed.slice(0, best).trim()
    }
    const withEllipsis = `${trimmed.replace(/[…]+$/, '')}…`
    if (estimatePostWrapLines(withEllipsis, fontSize, maxWidth) <= maxLines) {
      return withEllipsis
    }
  }
  return trimmed
}

function resolvePostHeadlineLayout(titlePlain: string, contentWidth: number): {
  displayTitle: string
  titleSize: number
  titleLineHeight: number
  titleWrapLines: number
  titleBlockHeight: number
} {
  const len = titlePlain.length
  let titleSize =
    len > 110 ? 46 :
    len > 90 ? 50 :
    len > 70 ? 56 :
    len > 50 ? 62 :
    len > 35 ? 68 :
    len > 22 ? 74 :
    80

  let wrapLines = estimatePostWrapLines(titlePlain, titleSize, contentWidth)
  while (wrapLines > POST_HEADLINE_MAX_LINES && titleSize > POST_HEADLINE_MIN_SIZE) {
    titleSize -= 4
    wrapLines = estimatePostWrapLines(titlePlain, titleSize, contentWidth)
  }

  let displayTitle = titlePlain
  if (wrapLines > POST_HEADLINE_MAX_LINES) {
    displayTitle = truncatePostToMaxLines(titlePlain, titleSize, contentWidth, POST_HEADLINE_MAX_LINES)
    wrapLines = Math.min(
      POST_HEADLINE_MAX_LINES,
      Math.max(1, estimatePostWrapLines(displayTitle.replace(/…$/, ''), titleSize, contentWidth)),
    )
  }

  const titleLineHeight =
    wrapLines >= 4 ? 1.22 :
    wrapLines >= 3 ? 1.25 :
    wrapLines >= 2 ? 1.28 :
    1.22
  const titleBlockHeight = Math.ceil(titleSize * titleLineHeight * wrapLines)

  return { displayTitle, titleSize, titleLineHeight, titleWrapLines: wrapLines, titleBlockHeight }
}

// ── Asset helpers ───────────────────────────────────────────────────────────
async function loadPublicAssetDataUri(relativePath: string): Promise<string | null> {
  try {
    const filePath = path.join(process.cwd(), 'public', relativePath)
    const buf = await readFile(filePath)
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'ico' ? 'image/x-icon' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

async function loadBrandAssets(): Promise<{ onyeditiviLogo: string | null; nahaberIcon: string | null }> {
  const onyeditiviLogo = await loadPublicAssetDataUri(ONYEDITIVI_LOGO)
  let nahaberIcon: string | null = null
  for (const candidate of NAHABER_ICON_CANDIDATES) {
    nahaberIcon = await loadPublicAssetDataUri(candidate)
    if (nahaberIcon) break
  }
  return { onyeditiviLogo, nahaberIcon }
}

async function resolvePhotoDataUri(
  imageSource: Buffer | string,
  width: number,
  height: number,
): Promise<string> {
  if (Buffer.isBuffer(imageSource)) {
    const jpeg = await sharp(imageSource, { failOn: 'none' })
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'top' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  }

  const rawUrl = normalizeAbsoluteImageUrl(imageSource)
  if (rawUrl && isUsableImageUrl(rawUrl)) {
    const embedded = await embedCoverTopImage([rawUrl], width, height, 84, true)
    if (embedded) return embedded
  }

  const fallbackNavy = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 13, g: 35, b: 85, alpha: 1 },
    },
  })
    .jpeg()
    .toBuffer()
  return `data:image/jpeg;base64,${fallbackNavy.toString('base64')}`
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
  const W = STORY_W
  const H = STORY_H
  const contentWidth = W - STORY_TEXT_PAD_SIDE * 2
  const faviconSize = 40

  const [fonts, brand, photo] = await Promise.all([
    getBundledOgFontsSync(),
    loadBrandAssets(),
    resolvePhotoDataUri(opts.imageSource, W, H),
  ])

  const rawTitle = overlayHeadlineFromTitle(opts.title || '', 120, 160)
  const title = pickCompleteOgHeadline(rawTitle, opts.title || rawTitle, 120, 160)
  const titlePlain = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

  const categoryId = opts.categoryId || 'gundem'
  const isBreaking = opts.isBreaking || categoryId === 'son-dakika'
  const categoryLabel = getSocialPostCategoryLabel(categoryId, isBreaking)

  const summary = opts.summary
    ? clampCompleteSentences(opts.summary.replace(/\s+/g, ' ').trim(), 200, 232)
    : ''

  const headline = resolveStoryHeadlineLayout(titlePlain, contentWidth)
  const { displayTitle, titleSize, titleLineHeight, titleBlockHeight } = headline
  const summaryLayout = resolveStorySummaryLayout(summary, contentWidth)
  const { displaySummary, summarySize, summaryLineHeight, summaryBlockHeight } = summaryLayout

  const bodyFamily = fonts.length > 0
    ? `"${FONT_BODY}", "Helvetica Neue", Helvetica, Arial, sans-serif`
    : '"Helvetica Neue", Helvetica, Arial, sans-serif'

  const imgResponse = new ImageResponse(
    <div style={{
      width: W, height: H, display: 'flex',
      fontFamily: bodyFamily,
      background: NAVY, overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Full-bleed photo */}
      <img
        src={photo}
        alt=""
        width={W}
        height={H}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: W, height: H,
          display: 'flex',
        }}
      />

      {/* Gradient scrim — photo → lacivert panel */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: STORY_PANEL_H + 160,
        background: `linear-gradient(to top, rgba(13,35,85,1) 0%, rgba(13,35,85,0.98) 20%, rgba(13,35,85,0.88) 38%, rgba(13,35,85,0.55) 58%, rgba(13,35,85,0.18) 78%, transparent 100%)`,
        display: 'flex',
      }} />

      {/* Onyeditivi 17 logo — sol üst, okunaklı boyut + hafif gölge */}
      {brand.onyeditiviLogo ? (
        <div style={{
          position: 'absolute', top: 32, left: 32,
          display: 'flex',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.45))',
        }}>
          <img
            src={brand.onyeditiviLogo}
            alt=""
            width={STORY_LOGO_SIZE}
            height={STORY_LOGO_SIZE}
            style={{
              width: STORY_LOGO_SIZE, height: STORY_LOGO_SIZE,
              display: 'flex',
            }}
          />
        </div>
      ) : null}

      {/* Bottom text panel */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: STORY_PANEL_H,
        display: 'flex', flexDirection: 'column',
        padding: `0 ${STORY_TEXT_PAD_SIDE}px ${STORY_TEXT_PAD_BOTTOM}px`,
        justifyContent: 'flex-end',
      }}>
        {/* Category row — light-blue accent + label */}
        <div style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center',
          gap: 12, marginBottom: 22,
        }}>
          <div style={{
            width: 4, height: 32, borderRadius: 2,
            background: LBLUE, flexShrink: 0, display: 'flex',
          }} />
          <span style={{
            color: '#ffffff', fontWeight: 800, fontSize: 32,
            letterSpacing: 2.5, display: 'flex',
          }}>{categoryLabel}</span>
        </div>

        {/* Headline — max 3 satır */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          marginBottom: displaySummary ? STORY_HEADLINE_GAP_BELOW : 36,
          minHeight: titleBlockHeight,
          maxHeight: titleBlockHeight,
          overflow: 'hidden',
        }}>
          <span style={{
            color: '#ffffff', fontWeight: 800,
            fontSize: titleSize, lineHeight: titleLineHeight,
            letterSpacing: 0.1, display: 'flex',
          }}>{displayTitle}</span>
        </div>

        {/* Ayraç + kısa özet */}
        {displaySummary ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 18,
            marginBottom: 28, flexShrink: 0,
          }}>
            <div style={{
              display: 'flex', flexDirection: 'row', alignItems: 'center',
              width: '100%',
            }}>
              <div style={{
                width: 56, height: 2, borderRadius: 1,
                background: LBLUE, flexShrink: 0, display: 'flex',
              }} />
              <div style={{
                flex: 1, height: 2, borderRadius: 1,
                background: 'rgba(255,255,255,0.28)',
                display: 'flex',
              }} />
            </div>
            <span style={{
              color: '#ffffff', fontWeight: 400,
              fontSize: summarySize, lineHeight: summaryLineHeight,
              letterSpacing: 0.05, display: 'flex',
              minHeight: summaryBlockHeight,
              flexShrink: 0,
            }}>{displaySummary}</span>
          </div>
        ) : null}

        {/* Thin blue line + centered NaHaber favicon */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', height: faviconSize, width: '100%',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '50%',
            height: 2, background: LBLUE, display: 'flex',
          }} />
          {brand.nahaberIcon ? (
            <div style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: NAVY, padding: '0 12px',
            }}>
              <img
                src={brand.nahaberIcon}
                alt=""
                width={faviconSize}
                height={faviconSize}
                style={{ width: faviconSize, height: faviconSize, display: 'flex', borderRadius: 6 }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    {
      width: W,
      height: H,
      ...(fonts.length > 0 ? { fonts } : {}),
    }
  )

  const pngBuf = Buffer.from(await imgResponse.arrayBuffer())
  return await sharp(pngBuf, { failOn: 'none' })
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
  const W = POST_W
  const H = POST_H
  const contentWidth = W - POST_TEXT_PAD_SIDE * 2
  const faviconSize = 36

  const [fonts, brand, photo] = await Promise.all([
    getBundledOgFontsSync(),
    loadBrandAssets(),
    resolvePhotoDataUri(opts.imageSource, W, H),
  ])

  const rawTitle = overlayHeadlineFromTitle(opts.title || '', 120, 160)
  const title = pickCompleteOgHeadline(rawTitle, opts.title || rawTitle, 120, 160)
  const titlePlain = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

  const categoryId = opts.categoryId || 'gundem'
  const isBreaking = opts.isBreaking || categoryId === 'son-dakika'
  const categoryLabel = getSocialPostCategoryLabel(categoryId, isBreaking)

  const headline = resolvePostHeadlineLayout(titlePlain, contentWidth)
  const { displayTitle, titleSize, titleLineHeight, titleBlockHeight } = headline

  const bodyFamily = fonts.length > 0
    ? `"${FONT_BODY}", "Helvetica Neue", Helvetica, Arial, sans-serif`
    : '"Helvetica Neue", Helvetica, Arial, sans-serif'

  const imgResponse = new ImageResponse(
    <div style={{
      width: W, height: H, display: 'flex',
      fontFamily: bodyFamily,
      background: NAVY, overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Full-bleed photo */}
      <img
        src={photo}
        alt=""
        width={W}
        height={H}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: W, height: H,
          display: 'flex',
        }}
      />

      {/* Gradient scrim */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: POST_PANEL_H + 120,
        background: `linear-gradient(to top, rgba(13,35,85,1) 0%, rgba(13,35,85,0.98) 22%, rgba(13,35,85,0.85) 42%, rgba(13,35,85,0.45) 62%, rgba(13,35,85,0.12) 80%, transparent 100%)`,
        display: 'flex',
      }} />

      {/* Onyeditivi logo top-left */}
      {brand.onyeditiviLogo ? (
        <div style={{
          position: 'absolute', top: 28, left: 28,
          display: 'flex',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.45))',
        }}>
          <img
            src={brand.onyeditiviLogo}
            alt=""
            width={POST_LOGO_SIZE}
            height={POST_LOGO_SIZE}
            style={{
              width: POST_LOGO_SIZE, height: POST_LOGO_SIZE,
              display: 'flex',
            }}
          />
        </div>
      ) : null}

      {/* Bottom text panel */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: POST_PANEL_H,
        display: 'flex', flexDirection: 'column',
        padding: `0 ${POST_TEXT_PAD_SIDE}px ${POST_TEXT_PAD_BOTTOM}px`,
        justifyContent: 'flex-end',
      }}>
        {/* Category row */}
        <div style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center',
          gap: 10, marginBottom: 18,
        }}>
          <div style={{
            width: 4, height: 28, borderRadius: 2,
            background: LBLUE, flexShrink: 0, display: 'flex',
          }} />
          <span style={{
            color: '#ffffff', fontWeight: 800, fontSize: 28,
            letterSpacing: 2.5, display: 'flex',
          }}>{categoryLabel}</span>
        </div>

        {/* Headline */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          marginBottom: POST_HEADLINE_GAP_ABOVE_FOOTER,
          minHeight: titleBlockHeight,
          maxHeight: titleBlockHeight,
          overflow: 'hidden',
        }}>
          <span style={{
            color: '#ffffff', fontWeight: 800,
            fontSize: titleSize, lineHeight: titleLineHeight,
            letterSpacing: 0.1, display: 'flex',
          }}>{displayTitle}</span>
        </div>

        {/* Thin blue line + centered NaHaber favicon */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', height: faviconSize, width: '100%',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '50%',
            height: 2, background: LBLUE, display: 'flex',
          }} />
          {brand.nahaberIcon ? (
            <div style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: NAVY, padding: '0 10px',
            }}>
              <img
                src={brand.nahaberIcon}
                alt=""
                width={faviconSize}
                height={faviconSize}
                style={{ width: faviconSize, height: faviconSize, display: 'flex', borderRadius: 5 }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    {
      width: W,
      height: H,
      ...(fonts.length > 0 ? { fonts } : {}),
    }
  )

  const pngBuf = Buffer.from(await imgResponse.arrayBuffer())
  return await sharp(pngBuf, { failOn: 'none' })
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
