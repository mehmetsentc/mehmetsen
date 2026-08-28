/**
 * GET /api/og/story/[id]
 *
 * ONYEDİTİVİ — 1080×1920 Instagram & Facebook Hikaye görseli (9:16)
 *
 * Layout (approved onyeditivi story card):
 *   ┌─────────────────────────┐
 *   │ [17 logo]               │  sol üst — ~110px, okunaklı
 *   │                         │
 *   │   HABER FOTOĞRAFI       │  full-bleed cover (~60%)
 *   │                         │
 *   │ ─── gradient scrim ───  │
 *   │  ▌ KATEGORİ             │  lacivert panel + açık mavi accent
 *   │  MANŞET (Inter bold)    │  büyük punto (~70–90px)
 *   │  ── ayraç ──            │  açık mavi + muted çizgi
 *   │  kısa özet (Inter)      │  ~120–160 karakter, 2–3 satır
 *   │  ──── [NaHaber] ────    │  ince mavi çizgi + favicon ortada
 *   └─────────────────────────┘
 *
 * Preview (Firestore olmadan):
 *   /api/og/story/sample?title=...&summary=...&image=...&category=gundem&breaking=1
 */
export const runtime = 'nodejs'

import { readFile } from 'fs/promises'
import path from 'path'
import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { embedCoverTopImage, isUsableImageUrl, normalizeAbsoluteImageUrl } from '@/lib/social/ogImageEmbed'
import { OG_IMAGE_CACHE_CONTROL } from '@/lib/social/ogCacheVersion'
import {
  clampCompleteSentences,
  isIncompleteHeadline,
  overlayHeadlineFromTitle,
  pickCompleteOgHeadline,
} from '@/lib/social/feedCaption'
import { isGarbledSocialCopy, repairSocialCopyAgainstSource } from '@/lib/social/socialFactualFidelity'
import { getSocialPostCategoryLabel } from '@/lib/social/socialPostCategory'
import { stripHtmlToNewsPlainText } from '@/lib/stripHtmlToNewsPlainText'

const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

/** Story manşet — softMax ile tam başlık; layout satır/font ile sığdırır */
const TITLE_MAX = 120
const TITLE_SOFT_MAX = 160
/** Kısa özet — 2–3 satır; AI storySummary ile hizalı, cümle/kelime ortasından kesilmez */
const SUMMARY_MAX = 200

const HEADLINE_MAX_LINES = 3
const HEADLINE_MIN_SIZE = 56
const HEADLINE_GAP_BELOW = 22
const SUMMARY_MAX_LINES = 3
const SUMMARY_MIN_SIZE = 30

/** Cümle sonu: .!?… + isteğe bağlı kapanış tırnak/parantez */
const STORY_SENTENCE_END_RE = /[.!?…]["'»”’)\]]*(?=\s|$)/g
const STORY_COMPLETE_TAIL_RE = /[.!?…]["'»”’)\]]*$/
const STORY_DANGLING_TAIL_RE =
  /\s+(ve|veya|ile|için|olan|olacak|olanlar|ama|fakat|ancak|ki|bir|bu|şu|o|de|da|kadar|gibi|üzerine|hakkında|sonrası|öncesi|nedeniyle|yüzünden|dolayı|yaşındaki|yaşında|aylık|günlük|yıllık|adlı|isimli|konulu|yönelik|ilişkin|ait|edilen|edilmiş|yapılan|vurulan|yaralanan|öldürülen|gözaltına|tutuklanan|açıklayan|söyleyen|belirten|ağır|hafif|kritik|ciddi|ölümcül)\s*$/iu

function avgGlyphWidth(fontSize: number, weight: 'bold' | 'regular' = 'bold'): number {
  return fontSize * (weight === 'regular' ? 0.56 : 0.55)
}

function estimateWrapLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  weight: 'bold' | 'regular' = 'bold',
): number {
  const plain = text.replace(/\s+/g, ' ').trim()
  if (!plain) return 0
  const words = plain.split(' ')
  const charW = avgGlyphWidth(fontSize, weight)
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

function stripDanglingTail(text: string): string {
  let out = text.trim()
  for (let i = 0; i < 6; i++) {
    const next = out.replace(STORY_DANGLING_TAIL_RE, '').trim()
    if (next === out) break
    out = next
  }
  return out
}

function truncateToMaxLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
  weight: 'bold' | 'regular' = 'bold',
): string {
  const plain = text.replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  if (estimateWrapLines(plain, fontSize, maxWidth, weight) <= maxLines && !isIncompleteHeadline(plain)) {
    return plain
  }

  const words = plain.split(' ')
  const charW = avgGlyphWidth(fontSize, weight)
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

  let trimmed = stripDanglingTail(result)
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
    if (estimateWrapLines(withEllipsis, fontSize, maxWidth, weight) <= maxLines) {
      return withEllipsis
    }
    const words2 = trimmed.split(' ')
    while (words2.length > 1) {
      words2.pop()
      const candidate = stripDanglingTail(words2.join(' '))
      if (!candidate) continue
      if (STORY_COMPLETE_TAIL_RE.test(candidate)) return candidate
      const ell = `${candidate}…`
      if (estimateWrapLines(ell, fontSize, maxWidth, weight) <= maxLines) return ell
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

  let wrapLines = estimateWrapLines(titlePlain, titleSize, contentWidth, 'bold')
  while (wrapLines > HEADLINE_MAX_LINES && titleSize > HEADLINE_MIN_SIZE) {
    titleSize -= 4
    wrapLines = estimateWrapLines(titlePlain, titleSize, contentWidth, 'bold')
  }

  let displayTitle = titlePlain
  if (wrapLines > HEADLINE_MAX_LINES) {
    displayTitle = truncateToMaxLines(titlePlain, titleSize, contentWidth, HEADLINE_MAX_LINES, 'bold')
    wrapLines = Math.min(
      HEADLINE_MAX_LINES,
      Math.max(1, estimateWrapLines(displayTitle.replace(/…$/, ''), titleSize, contentWidth, 'bold')),
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
  let wrapLines = estimateWrapLines(summaryPlain, summarySize, contentWidth, 'regular')
  while (wrapLines > SUMMARY_MAX_LINES && summarySize > SUMMARY_MIN_SIZE) {
    summarySize -= 2
    wrapLines = estimateWrapLines(summaryPlain, summarySize, contentWidth, 'regular')
  }

  let displaySummary = summaryPlain
  if (wrapLines > SUMMARY_MAX_LINES || !STORY_COMPLETE_TAIL_RE.test(summaryPlain)) {
    displaySummary = truncateToMaxLines(
      summaryPlain, summarySize, contentWidth, SUMMARY_MAX_LINES, 'regular',
    )
    if (!STORY_COMPLETE_TAIL_RE.test(displaySummary) && !displaySummary.endsWith('…')) {
      while (summarySize > SUMMARY_MIN_SIZE) {
        summarySize -= 2
        const retry = truncateToMaxLines(
          summaryPlain, summarySize, contentWidth, SUMMARY_MAX_LINES, 'regular',
        )
        if (STORY_COMPLETE_TAIL_RE.test(retry) || retry.endsWith('…')) {
          displaySummary = retry
          break
        }
        displaySummary = retry
      }
    }
    wrapLines = Math.min(
      SUMMARY_MAX_LINES,
      Math.max(1, estimateWrapLines(displaySummary.replace(/…$/, ''), summarySize, contentWidth, 'regular')),
    )
  }

  if (estimateWrapLines(displaySummary, summarySize, contentWidth, 'regular') > SUMMARY_MAX_LINES) {
    displaySummary = truncateToMaxLines(
      displaySummary, summarySize, contentWidth, SUMMARY_MAX_LINES, 'regular',
    )
    wrapLines = Math.min(
      SUMMARY_MAX_LINES,
      Math.max(1, estimateWrapLines(displaySummary.replace(/…$/, ''), summarySize, contentWidth, 'regular')),
    )
  }

  const summaryBlockHeight = Math.ceil(summarySize * summaryLineHeight * wrapLines)
  return { displaySummary, summarySize, summaryLineHeight, summaryWrapLines: wrapLines, summaryBlockHeight }
}

interface ArticleOGData {
  title: string
  socialHeadline: string
  socialStorySummary: string
  summary: string
  spot: string
  seoDescription: string
  content: string
  categoryId: string
  isBreaking: boolean
  imageUrl: string
  thumbnail: string
  coverImageUrl: string
  featuredImage: string
  image: string
}

async function fetchArticle(id: string): Promise<ArticleOGData | null> {
  // 1. Direct Admin Firestore in Node.js runtime (most reliable)
  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const { Collections } = await import('@/lib/firebase/collections')
    const db = getAdminFirestore()
    const doc = await db.collection(Collections.NEWS).doc(id).get()
    if (doc.exists) {
      const data = doc.data() as Record<string, unknown>
      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
      const categoryId = str(data.categoryId) || str(data.category) || 'gundem'
      const isBreaking = data.isBreaking === true || categoryId === 'son-dakika'
      return {
        title: str(data.title),
        socialHeadline: str(data.socialHeadline),
        socialStorySummary: str(data.socialStorySummary),
        summary: str(data.summary),
        spot: str(data.spot),
        seoDescription: str(data.seoDescription),
        content: str(data.content) || str(data.body) || str(data.htmlContent),
        categoryId,
        isBreaking,
        imageUrl: str(data.imageUrl),
        thumbnail: str(data.thumbnail),
        coverImageUrl: str(data.coverImageUrl),
        featuredImage: str(data.featuredImage),
        image: str(data.image),
      }
    }
  } catch (err) {
    console.warn(`[og/story] admin firestore fetch failed id=${id}:`, err)
  }

  // 2. REST API fallback
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(`${FIREBASE_URL}/${id}?key=${apiKey}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as {
      fields?: Record<string, { stringValue?: string; booleanValue?: boolean }>
    }
    const f = data.fields
    if (!f) return null
    const str = (v?: { stringValue?: string }) => v?.stringValue?.trim() || ''
    const categoryId = str(f.categoryId) || str(f.category)
    return {
      title: str(f.title),
      socialHeadline: str(f.socialHeadline),
      socialStorySummary: str(f.socialStorySummary),
      summary: str(f.summary),
      spot: str(f.spot),
      seoDescription: str(f.seoDescription),
      content: str(f.content),
      categoryId,
      isBreaking: f.isBreaking?.booleanValue === true || categoryId === 'son-dakika',
      imageUrl: str(f.imageUrl),
      thumbnail: str(f.thumbnail),
      coverImageUrl: str(f.coverImageUrl),
      featuredImage: str(f.featuredImage),
      image: str(f.image),
    }
  } catch {
    return null
  }
}

function bestImageCandidates(a: ArticleOGData): string[] {
  return [a.thumbnail, a.coverImageUrl, a.imageUrl, a.featuredImage, a.image]
    .map((u) => normalizeAbsoluteImageUrl(u))
    .filter((u) => isUsableImageUrl(u))
}

function clampHeadline(s: string, max: number, sourceTitle = ''): string {
  const lines = s
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4)
  if (lines.length === 0) return ''
  return pickCompleteOgHeadline(lines.join(' '), sourceTitle || lines.join(' '), max, TITLE_SOFT_MAX)
}

function extractFirstParagraph(content: string): string {
  const plain = stripHtmlToNewsPlainText(content)
  return plain.split(/\n+/).map((s) => s.trim()).filter(Boolean)[0] || ''
}

function resolveStorySummary(
  article: ArticleOGData | null,
  overrideSummary: string,
  overrideSpot: string,
): string {
  const aiSummary =
    article?.socialStorySummary && !isGarbledSocialCopy(article.socialStorySummary)
      ? article.socialStorySummary
      : ''
  const raw =
    overrideSummary ||
    overrideSpot ||
    aiSummary ||
    article?.summary ||
    article?.spot ||
    article?.seoDescription ||
    extractFirstParagraph(article?.content || '') ||
    ''
  const plain = stripHtmlToNewsPlainText(raw).replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  const source = [
    article?.title,
    article?.socialHeadline,
    article?.summary,
    article?.spot,
    article?.seoDescription,
    extractFirstParagraph(article?.content || ''),
  ]
    .filter(Boolean)
    .join('\n')
  const faithful = repairSocialCopyAgainstSource(plain, article?.title || '', source)
  return clampCompleteSentences(faithful, SUMMARY_MAX, SUMMARY_MAX + 32)
}

const W = 1080
const H = 1920
const TEXT_PAD_SIDE = 48
const TEXT_PAD_BOTTOM = 52
const PANEL_H = 880
const LOGO_SIZE = 110

const NAVY = '#0d2355'
const LBLUE = '#62b8e8'
const FONT_BODY = 'Inter'

const ONYEDITIVI_LOGO = 'brand/onyeditivi/logo.png'
const NAHABER_ICON_CANDIDATES = [
  'brand/icon-32.png',
  'brand/icon-192.png',
  'brand/cities/canakkale/icon-192.png',
]

function mimeFromBuffer(buf: Buffer, filePath: string): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'ico') return 'image/x-icon'
  return 'image/jpeg'
}

async function loadPublicAssetDataUri(relativePath: string): Promise<string | null> {
  try {
    const filePath = path.join(process.cwd(), 'public', relativePath)
    const buf = await readFile(filePath)
    const mime = mimeFromBuffer(buf, filePath)
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

import { loadStoryFonts } from '@/lib/social/ogFonts'

function fallbackImageResponse() {
  return new ImageResponse(
    <div style={{ width: W, height: H, display: 'flex', background: NAVY }}>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 40, margin: 'auto', display: 'flex' }}>NaHaber</span>
    </div>,
    { width: W, height: H }
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const q = req.nextUrl.searchParams
  const overrideTitle = q.get('title')?.trim() || ''
  const overrideSummary = q.get('summary')?.trim() || ''
  const overrideSpot = q.get('spot')?.trim() || ''
  const overrideImage = q.get('image')?.trim() || ''
  const overrideCategory = q.get('category')?.trim() || ''
  const overrideBreaking = q.get('breaking') === '1' || q.get('breaking') === 'true'

  let article: ArticleOGData | null = null
  if (id !== 'sample' && id !== 'preview') {
    try {
      article = await fetchArticle(id)
    } catch {
      // ignore fetch errors; fall back to query params
    }
  }

  const sourceTitle = article?.title || overrideTitle || ''
  const rawTitle = overlayHeadlineFromTitle(overrideTitle || article?.title || '', TITLE_MAX, TITLE_SOFT_MAX)
  if (!rawTitle) {
    if (id === 'sample' || id === 'preview') {
      return new Response('sample için ?title= (ve isteğe ?image= ?category=) gerekli', { status: 400 })
    }
    return new Response('Haber bulunamadi', { status: 404 })
  }

  const categoryId = overrideCategory || article?.categoryId || 'gundem'
  const isBreaking = overrideBreaking || article?.isBreaking || categoryId === 'son-dakika'
  const categoryLabel = getSocialPostCategoryLabel(categoryId, isBreaking)

  const imageCandidates = [overrideImage, ...(article ? bestImageCandidates(article) : [])]
  const photo = await embedCoverTopImage(imageCandidates, W, H, 84, true)

  if (!photo) {
    console.error(`[og/story] cover embed failed id=${id} candidates=${imageCandidates.filter(Boolean).length}`)
    return new Response('OG cover image unavailable', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Retry-After': '3',
      },
    })
  }

  const title = clampHeadline(rawTitle, TITLE_MAX, sourceTitle)
  const summary = resolveStorySummary(article, overrideSummary, overrideSpot)
  const titlePlain = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  const contentWidth = W - TEXT_PAD_SIDE * 2
  const headline = resolveStoryHeadlineLayout(titlePlain, contentWidth)
  const { displayTitle, titleSize, titleLineHeight, titleBlockHeight } = headline
  const summaryLayout = resolveStorySummaryLayout(summary, contentWidth)
  const {
    displaySummary,
    summarySize,
    summaryLineHeight,
    summaryBlockHeight,
  } = summaryLayout

  try {
    const [fonts, brand] = await Promise.all([loadStoryFonts(), loadBrandAssets()])
    const hasBodyFont = fonts.some((f) => f.name === FONT_BODY)
    const bodyFamily = hasBodyFont
      ? `"${FONT_BODY}", "Helvetica Neue", Helvetica, Arial, sans-serif`
      : '"Helvetica Neue", Helvetica, Arial, sans-serif'

    const faviconSize = 40

    return new ImageResponse(
      <div style={{
        width: W, height: H, display: 'flex',
        fontFamily: bodyFamily,
        background: NAVY, overflow: 'hidden',
        position: 'relative',
      }}>

        {/* Full-bleed photo */}
        <img src={photo} alt="" width={W} height={H}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: W, height: H,
            display: 'flex',
          }} />

        {/* Gradient scrim — photo → lacivert panel */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: PANEL_H + 160,
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
              width={LOGO_SIZE}
              height={LOGO_SIZE}
              style={{
                width: LOGO_SIZE, height: LOGO_SIZE,
                display: 'flex',
              }}
            />
          </div>
        ) : null}

        {/* Bottom text panel */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: PANEL_H,
          display: 'flex', flexDirection: 'column',
          padding: `0 ${TEXT_PAD_SIDE}px ${TEXT_PAD_BOTTOM}px`,
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

          {/* Headline — max 3 satır, özet ile çakışmayı önler */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            marginBottom: displaySummary ? HEADLINE_GAP_BELOW : 36,
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
        width: W, height: H,
        ...(fonts.length > 0 ? { fonts } : {}),
        headers: { 'Cache-Control': OG_IMAGE_CACHE_CONTROL },
      }
    )
  } catch {
    return fallbackImageResponse()
  }
}
