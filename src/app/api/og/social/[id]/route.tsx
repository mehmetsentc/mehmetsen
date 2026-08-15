/**
 * GET /api/og/social/[id]
 *
 * ONYEDİTİVİ — 1080×1350 Instagram & Facebook Post görseli (4:5)
 *
 * Layout (approved onyeditivi card):
 *   ┌─────────────────────────┐
 *   │ [17 logo]               │  küçük onyeditivi badge sol üst
 *   │                         │
 *   │   HABER FOTOĞRAFI       │  full-bleed cover
 *   │                         │
 *   │ ─── gradient scrim ───  │
 *   │  ▌ KATEGORİ             │  lacivert panel + açık mavi accent
 *   │  MANŞET (Inter bold)    │
 *   │  ──── [NaHaber] ────    │  ince mavi çizgi + favicon ortada
 *   └─────────────────────────┘
 *
 * Preview (Firestore olmadan):
 *   /api/og/social/sample?title=...&image=...&category=gundem
 */
export const runtime = 'nodejs'

import { readFile } from 'fs/promises'
import path from 'path'
import { ImageResponse } from 'next/og'
import { type NextRequest } from 'next/server'
import { embedCoverTopImage, isUsableImageUrl, normalizeAbsoluteImageUrl } from '@/lib/social/ogImageEmbed'
import { OG_IMAGE_CACHE_CONTROL } from '@/lib/social/ogCacheVersion'
import {
  isIncompleteHeadline,
  overlayHeadlineFromTitle,
  pickCompleteOgHeadline,
  shortenToLastCompleteClause,
  stripDanglingHeadlineTail,
} from '@/lib/social/feedCaption'
import { getSocialPostCategoryLabel } from '@/lib/social/socialPostCategory'

const PROJECT_ID = 'nahaberapp'
const FIREBASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/news`

/** Post manşet — softMax + daha küçük font ile tam kaynak başlık sığsın */
const TITLE_MAX = 120
const TITLE_SOFT_MAX = 160

const HEADLINE_MAX_LINES = 5
const HEADLINE_MIN_SIZE = 36
const HEADLINE_GAP_ABOVE_FOOTER = 20

/** Cümle / öbek sonu — manşet ortasında sessiz kesim yok */
const POST_SENTENCE_END_RE = /[.!?…]["'»”’)\]]*(?=\s|$)/g
const POST_COMPLETE_TAIL_RE = /[.!?…]["'»”’)\]]*$/
const POST_CLAUSE_END_RE = /[,;:—–-](?=\s|$)/g

/** Inter 800 yaklaşık ortalama glif genişliği (Satori word-wrap simülasyonu) */
function avgGlyphWidth(fontSize: number): number {
  return fontSize * 0.55
}

function estimateWrapLines(text: string, fontSize: number, maxWidth: number): number {
  const plain = text.replace(/\s+/g, ' ').trim()
  if (!plain) return 0
  const words = plain.split(' ')
  const charW = avgGlyphWidth(fontSize)
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

/** Satır taşarsa son TAM öbekte bitir; yarım kelime/öbek / trailing junk yok. */
function truncateToMaxLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
): string {
  const plain = stripDanglingHeadlineTail(text.replace(/\s+/g, ' ').trim())
  if (!plain) return ''
  if (estimateWrapLines(plain, fontSize, maxWidth) <= maxLines && !isIncompleteHeadline(plain)) {
    return plain
  }

  const words = plain.split(' ')
  const charW = avgGlyphWidth(fontSize)
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

  // Mümkünse son tam cümlede bitir
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
      const sentence = stripDanglingHeadlineTail(trimmed.slice(0, best).trim())
      if (!isIncompleteHeadline(sentence)) return sentence
    }
    // Cümle yoksa virgül/iki nokta öbeğinde dur (…kaybetti, …)
    POST_CLAUSE_END_RE.lastIndex = 0
    best = -1
    while ((m = POST_CLAUSE_END_RE.exec(trimmed)) !== null) {
      const end = m.index
      if (end >= minEnd) best = end
    }
    if (best >= minEnd) {
      const clause = stripDanglingHeadlineTail(trimmed.slice(0, best).replace(/[,;:—–-]+$/, '').trim())
      if (clause.length >= minEnd && !isIncompleteHeadline(clause)) return clause
    }
    // Tam öbekte kısalt — ellipsis yalnızca tamamlanmış kelime sonrası
    const clauseCut = shortenToLastCompleteClause(trimmed, trimmed.length)
    if (clauseCut && !isIncompleteHeadline(clauseCut)) {
      if (estimateWrapLines(clauseCut, fontSize, maxWidth) <= maxLines) return clauseCut
    }
    const words2 = trimmed.split(' ')
    while (words2.length > 2) {
      words2.pop()
      const candidate = stripDanglingHeadlineTail(words2.join(' '))
      if (!candidate || isIncompleteHeadline(candidate)) continue
      if (estimateWrapLines(candidate, fontSize, maxWidth) <= maxLines) return candidate
    }
    const safe = shortenToLastCompleteClause(plain, Math.max(40, Math.floor(plain.length * 0.7)))
    if (safe && !isIncompleteHeadline(safe)) return safe
    // Son çare: kelime kelime geriye — asla ulaç/yarım öbek bırakma
    const words3 = plain.split(' ').filter(Boolean)
    while (words3.length > 2) {
      words3.pop()
      const candidate = stripDanglingHeadlineTail(words3.join(' '))
      if (candidate && !isIncompleteHeadline(candidate)) return candidate
    }
    return stripDanglingHeadlineTail(words2.join(' ')) || safe || trimmed
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
    len > 110 ? 42 :
    len > 90 ? 46 :
    len > 78 ? 48 :
    len > 62 ? 52 :
    len > 52 ? 54 :
    len > 42 ? 58 :
    len > 32 ? 62 :
    len > 22 ? 66 :
    70

  let wrapLines = estimateWrapLines(titlePlain, titleSize, contentWidth)
  // Önce font küçült — tam manşet sığsın (yarım cümle bırakma)
  while (wrapLines > HEADLINE_MAX_LINES && titleSize > HEADLINE_MIN_SIZE) {
    titleSize -= 2
    wrapLines = estimateWrapLines(titlePlain, titleSize, contentWidth)
  }

  let displayTitle = titlePlain
  if (wrapLines > HEADLINE_MAX_LINES || isIncompleteHeadline(titlePlain)) {
    displayTitle = truncateToMaxLines(titlePlain, titleSize, contentWidth, HEADLINE_MAX_LINES)
    while (
      titleSize > HEADLINE_MIN_SIZE &&
      (estimateWrapLines(displayTitle, titleSize, contentWidth) > HEADLINE_MAX_LINES ||
        isIncompleteHeadline(displayTitle))
    ) {
      titleSize -= 2
      displayTitle = truncateToMaxLines(titlePlain, titleSize, contentWidth, HEADLINE_MAX_LINES)
      if (
        estimateWrapLines(titlePlain, titleSize, contentWidth) <= HEADLINE_MAX_LINES &&
        !isIncompleteHeadline(titlePlain)
      ) {
        displayTitle = titlePlain
        break
      }
    }
    wrapLines = Math.min(
      HEADLINE_MAX_LINES,
      Math.max(1, estimateWrapLines(displayTitle, titleSize, contentWidth)),
    )
  }

  // Güvenlik: display asla tahmin edilen satır sayısını aşmasın; yarım bitiş yok
  if (
    estimateWrapLines(displayTitle, titleSize, contentWidth) > HEADLINE_MAX_LINES ||
    isIncompleteHeadline(displayTitle)
  ) {
    displayTitle = truncateToMaxLines(titlePlain, titleSize, contentWidth, HEADLINE_MAX_LINES)
    wrapLines = Math.min(
      HEADLINE_MAX_LINES,
      Math.max(1, estimateWrapLines(displayTitle, titleSize, contentWidth)),
    )
  }

  const titleLineHeight =
    wrapLines >= 5 ? 1.18 :
    wrapLines >= 4 ? 1.2 :
    wrapLines >= 3 ? 1.24 :
    wrapLines >= 2 ? 1.28 :
    1.22
  const titleBlockHeight = Math.ceil(titleSize * titleLineHeight * wrapLines)

  return { displayTitle, titleSize, titleLineHeight, titleWrapLines: wrapLines, titleBlockHeight }
}

interface ArticleOGData {
  title: string
  socialHeadline: string
  summary: string
  spot: string
  categoryId: string
  isBreaking: boolean
  imageUrl: string
  thumbnail: string
  coverImageUrl: string
  featuredImage: string
  image: string
}

async function fetchArticle(id: string): Promise<ArticleOGData | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(`${FIREBASE_URL}/${id}?key=${apiKey}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json() as {
      fields?: Record<string, { stringValue?: string; booleanValue?: boolean }>
    }
    const f = data.fields
    if (!f) return null
    const str = (v?: { stringValue?: string }) => v?.stringValue?.trim() || ''
    const categoryId = str(f.categoryId) || str(f.category)
    return {
      title: str(f.title),
      socialHeadline: str(f.socialHeadline),
      summary: str(f.summary),
      spot: str(f.spot),
      categoryId,
      isBreaking: f.isBreaking?.booleanValue === true || categoryId === 'son-dakika',
      imageUrl: str(f.imageUrl),
      thumbnail: str(f.thumbnail),
      coverImageUrl: str(f.coverImageUrl),
      featuredImage: str(f.featuredImage),
      image: str(f.image),
    }
  } catch { return null }
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
    .slice(0, 5)
  if (lines.length === 0) return ''
  const joined = lines.join(' ')
  // AI socialHeadline yarım/junk ise kaynak title — Meta caption asla manşet olmaz
  return pickCompleteOgHeadline(joined, sourceTitle || joined, max, TITLE_SOFT_MAX)
}

const W = 1080
const H = 1350
const TEXT_PAD_SIDE = 48
const TEXT_PAD_BOTTOM = 48
/** 5 satır manşet + kategori + footer için panel */
const PANEL_H = 620
const LOGO_SIZE = 88

const NAVY = '#0d2355'
const LBLUE = '#62b8e8'
const FONT_BODY = 'Inter'

const ONYEDITIVI_LOGO = 'brand/onyeditivi/logo.png'
const NAHABER_ICON_CANDIDATES = [
  'brand/cities/canakkale/icon-192.png',
  'brand/icon-192.png',
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

async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl =
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`
    const css = await fetch(cssUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1',
      },
      cache: 'force-cache',
    }).then((r) => r.text())
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(?:opentype|truetype)['"]?\)/i)
      || css.match(/src:\s*url\(([^)]+)\)/i)
    if (!match?.[1]) return null
    const res = await fetch(match[1], { cache: 'force-cache' })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

type OgFontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
type OgFont = { name: string; data: ArrayBuffer; weight: OgFontWeight; style: 'normal' }

async function loadPostFonts(): Promise<OgFont[]> {
  const specs: Array<{ name: string; weight: OgFontWeight }> = [
    { name: FONT_BODY, weight: 600 },
    { name: FONT_BODY, weight: 700 },
    { name: FONT_BODY, weight: 800 },
    { name: FONT_BODY, weight: 900 },
  ]
  const loaded = await Promise.all(
    specs.map(async (s) => {
      const data = await loadGoogleFont(s.name, s.weight)
      return data ? { name: s.name, data, weight: s.weight, style: 'normal' as const } : null
    })
  )
  return loaded.filter((f): f is OgFont => f !== null)
}

function fallbackImageResponse() {
  return new ImageResponse(
    <div style={{ width: W, height: H, display: 'flex', background: NAVY }}>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 36, margin: 'auto', display: 'flex' }}>NaHaber</span>
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
  const overrideImage = q.get('image')?.trim() || ''
  const overrideCategory = q.get('category')?.trim() || ''
  const overrideBreaking = q.get('breaking') === '1' || q.get('breaking') === 'true'

  let article: ArticleOGData | null = null
  if (id !== 'sample' && id !== 'preview') {
    try { article = await fetchArticle(id) } catch { return fallbackImageResponse() }
  }

  const sourceTitle = article?.title || overrideTitle || ''
  // Overlay = haber başlığı. AI socialHeadline görsele yazılmaz.
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

  // Kapaksız lacivert kartı Meta'ya "başarılı görsel" olarak vermeyiz — CDN'e yazılmaz, IG solid blue postlamaz.
  if (!photo) {
    console.error(`[og/social] cover embed failed id=${id} candidates=${imageCandidates.filter(Boolean).length}`)
    return new Response('OG cover image unavailable', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Retry-After': '3',
      },
    })
  }

  // Yarım AI manşeti varsa kaynak title; softMax ile tam manşet
  const title = clampHeadline(rawTitle, TITLE_MAX, sourceTitle)
  const titlePlain = stripDanglingHeadlineTail(title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
  const contentWidth = W - TEXT_PAD_SIDE * 2
  const headline = resolvePostHeadlineLayout(titlePlain, contentWidth)
  const { displayTitle, titleSize, titleLineHeight, titleBlockHeight } = headline

  try {
    const [fonts, brand] = await Promise.all([loadPostFonts(), loadBrandAssets()])
    const hasBodyFont = fonts.some((f) => f.name === FONT_BODY)
    const bodyFamily = hasBodyFont
      ? `"${FONT_BODY}", "Helvetica Neue", Helvetica, Arial, sans-serif`
      : '"Helvetica Neue", Helvetica, Arial, sans-serif'

    const faviconSize = 36

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
          position: 'absolute', bottom: 0, left: 0, right: 0, height: PANEL_H + 120,
          background: `linear-gradient(to top, rgba(13,35,85,1) 0%, rgba(13,35,85,0.98) 22%, rgba(13,35,85,0.88) 42%, rgba(13,35,85,0.55) 62%, rgba(13,35,85,0.18) 82%, transparent 100%)`,
          display: 'flex',
        }} />
        {brand.onyeditiviLogo ? (
          <img
            src={brand.onyeditiviLogo}
            alt=""
            width={LOGO_SIZE}
            height={LOGO_SIZE}
            style={{
              position: 'absolute', top: 28, left: 28,
              width: LOGO_SIZE, height: LOGO_SIZE,
              display: 'flex',
            }}
          />
        ) : null}

        {/* Bottom text panel — footer sabit, metin yukarıda kalır */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: PANEL_H,
          display: 'flex', flexDirection: 'column',
          padding: `0 ${TEXT_PAD_SIDE}px ${TEXT_PAD_BOTTOM}px`,
        }}>
          <div style={{
            flex: 1, minHeight: 0,
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}>
            {/* Category row — light-blue accent + label */}
            <div style={{
              display: 'flex', flexDirection: 'row', alignItems: 'center',
              gap: 12, marginBottom: 18, flexShrink: 0,
            }}>
              <div style={{
                width: 4, height: 28, borderRadius: 2,
                background: LBLUE, flexShrink: 0, display: 'flex',
              }} />
              <span style={{
                color: '#ffffff', fontWeight: 800, fontSize: 30,
                letterSpacing: 2.5, display: 'flex',
              }}>{categoryLabel}</span>
            </div>

            {/* Headline — max 4 satır; metin önceden sığdırılır, CSS clip yok */}
            <div style={{
              display: 'flex', flexDirection: 'column',
              marginBottom: HEADLINE_GAP_ABOVE_FOOTER,
              minHeight: titleBlockHeight,
              flexShrink: 0,
            }}>
              <span style={{
                color: '#ffffff', fontWeight: 800,
                fontSize: titleSize, lineHeight: titleLineHeight,
                letterSpacing: 0.1, display: 'flex',
                flexShrink: 0,
              }}>{displayTitle}</span>
            </div>
          </div>

          {/* Thin blue line + centered NaHaber favicon — rezerve alt bölge */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', height: faviconSize, width: '100%',
            flexShrink: 0,
          }}>
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '50%',
              height: 2, background: LBLUE, display: 'flex',
            }} />
            {brand.nahaberIcon ? (
              <div style={{
                position: 'relative', zIndex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: NAVY, padding: '0 10px',
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
